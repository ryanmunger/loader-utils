var assert = require("assert"),
	loaderUtils = require("../");

function ExpectedError(regex) { this.regex = regex; }
ExpectedError.prototype.matches = function (err) {
	return this.regex.test(err.message);
};

describe("loader-utils", function() {
	describe("#urlToRequest()", function() {
		[
			// without root
			[["path/to/thing"], "./path/to/thing", "should handle implicit relative urls"],
			[["./path/to/thing"], "./path/to/thing", "should handle explicit relative urls"],
			[["~path/to/thing"], "path/to/thing", "should handle module urls (with ~)"],
			[["some/other/stuff/and/then~path/to/thing"], "path/to/thing", "should handle module urls with path prefix"],
			[["./some/other/stuff/and/then~path/to/thing"], "path/to/thing", "should handle module urls with relative path prefix"],
			// with root (normal path)
			[["path/to/thing", "root/dir"], "./path/to/thing", "should do nothing with root if implicit relative url"],
			[["./path/to/thing", "root/dir"], "./path/to/thing", "should do nothing with root if explicit relative url"],
			[["/path/to/thing", "root/dir"], "root/dir/path/to/thing", "should include root if root-relative url"],
			// with root (boolean)
			[["/path/to/thing", true], "/path/to/thing", "should allow root-relative to exist as-is if root = `true`"],
			// with root (module)
			[["/path/to/thing", "~"], "path/to/thing", "should convert to module url if root = ~"],
			// with root (module path)
			[["/path/to/thing", "~module"], "module/path/to/thing", "should allow module prefixes when root starts with ~"],
			[["/path/to/thing", "~module/"], "module/path/to/thing", "should allow module prefixes (with trailing slash) when root starts with ~"],
			// error cases
			[["/path/to/thing", 1], new ExpectedError(/unexpected parameters/i), "should throw an error on invalid root"]
		].forEach(function(test) {
			it(test[2], function() {
				var expected = test[1];
				try {
					var request = loaderUtils.urlToRequest.apply(loaderUtils, test[0]);
					assert.equal(request, expected);
				} catch (e) {
					if (expected instanceof ExpectedError) {
						assert.ok(expected.matches(e));
					} else {
						assert.ok(false, "should not have thrown an error: " + e.message);
					}
				}
			});
		});
	});

	describe("#parseString", function() {
		[
			["test string", "test string"],
			[JSON.stringify("!\"§$%&/()=?'*#+,.-;öäü:_test"), "!\"§$%&/()=?'*#+,.-;öäü:_test"],
			["'escaped with single \"'", 'escaped with single "'],
			["invalid \"' string", "invalid \"' string"],
			["\'inconsistent start and end\"", "\'inconsistent start and end\""]
		].forEach(function(test) {
			it("should parse " + test[0], function() {
				var parsed = loaderUtils.parseString(test[0]);
				assert.equal(parsed, test[1]);
			});
		});
	});

	describe("#parseQuery", function() {
		[
			[
				"?sweet=true&name=cheesecake&slices=8&delicious&warm=false",
				{"sweet":true,"name":"cheesecake","slices":"8","delicious":true,"warm": false}
			]
		].forEach(function(test) {
			it("should parse " + test[0], function() {
				var parsed = loaderUtils.parseQuery(test[0]);
				assert.deepEqual(parsed, test[1]);
			});
		});
	});

	describe("#getHashDigest", function() {
		[
			["test string", "md5", "hex", undefined, "6f8db599de986fab7a21625b7916589c"],
			["test string", "md5", "hex", 4, "6f8d"],
			["test string", "md5", "base64", undefined, "2sm1pVmS8xuGJLCdWpJoRL"],
			["test string", "md5", "base52", undefined, "dJnldHSAutqUacjgfBQGLQx"],
			["test string", "md5", "base26", 6, "bhtsgu"],
			["test string", "sha512", "base64", undefined, "2IS-kbfIPnVflXb9CzgoNESGCkvkb0urMmucPD9z8q6HuYz8RShY1-tzSUpm5-Ivx_u4H1MEzPgAhyhaZ7RKog"],
			["test_string", "md5", "hex", undefined, "3474851a3410906697ec77337df7aae4"]
		].forEach(function(test) {
			it("should getHashDigest " + test[0] + " " + test[1] + " " + test[2] + " " + test[3], function() {
				var hashDigest = loaderUtils.getHashDigest(test[0], test[1], test[2], test[3]);
				assert.equal(hashDigest, test[4]);
			});
		});
	});

	describe("#interpolateName", function() {
		function run(tests) {
			tests.forEach(function(test) {
				var args = test[0];
				var expected = test[1];
				var message = test[2];
				it(message, function() {
					var result = loaderUtils.interpolateName.apply(loaderUtils, args);
					if (typeof expected === "function") {
						expected(result);
					} else {
						assert.equal(result, expected);
					}
				});
			});
		}

		run([
			[[{}, "", { content: "test string" }], "6f8db599de986fab7a21625b7916589c.bin", "should interpolate default tokens"],
			[[{}, "[hash:base64]", { content: "test string" }], "2sm1pVmS8xuGJLCdWpJoRL", "should interpolate [hash] token with options"],
			[[{}, "[unrecognized]", { content: "test string" }], "[unrecognized]", "should not interpolate unrecognized token"],
		]);

		var emojiRegex = /[\uD800-\uDFFF]./;
		run([
			[
				[{}, "[emoji]", { content: "test" }],
				function(result) {
					assert.ok(emojiRegex.test(result), result);
				},
				"should interpolate [emoji]"
			],
			[
				[{}, "[emoji:3]", { content: "string" }],
				function(result) {
					assert.ok(emojiRegex.test(result), result);
					assert.ok(result.length, 6);
				},
				"should interpolate [emoji:3]"
			],
		]);
		it("should return the same emoji for the same string", function() {
			var args = [{}, "[emoji:5]", { content: "same_emoji" }];
			var result1 = loaderUtils.interpolateName.apply(loaderUtils, args);
			var result2 = loaderUtils.interpolateName.apply(loaderUtils, args);
			assert.equal(result1, result2);
		});

		context("no loader context", function() {
			var loaderContext = {};
			run([
				[[loaderContext, "[ext]", {}], "bin", "should interpolate [ext] token"],
				[[loaderContext, "[name]", {}], "file", "should interpolate [name] token"],
				[[loaderContext, "[path]", {}], "", "should interpolate [path] token"]
			]);
		});

		context("with loader context", function() {
			var loaderContext = { resourcePath: "/path/to/file.exe" };
			run([
				[[loaderContext, "[ext]", {}], "exe", "should interpolate [ext] token"],
				[[loaderContext, "[name]", {}], "file", "should interpolate [name] token"],
				[[loaderContext, "[path]", {}], "/path/to/", "should interpolate [path] token"]
			]);
		});
	});
});
