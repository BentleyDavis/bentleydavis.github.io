
module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("img");
  eleventyConfig.addPassthroughCopy("CNAME");
  eleventyConfig.addPassthroughCopy("android-chrome-192x192.png");
  eleventyConfig.addPassthroughCopy("android-chrome-512x512.png");
  eleventyConfig.addPassthroughCopy("apple-touch-icon.png");
  eleventyConfig.addPassthroughCopy("browserconfig.xml");
  eleventyConfig.addPassthroughCopy("favicon-16x16.png");
  eleventyConfig.addPassthroughCopy("favicon-32x32.png");
  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy("mstile-150x150.png");
  eleventyConfig.addPassthroughCopy("safari-pinned-tab.svg");
  eleventyConfig.addPassthroughCopy("site.webmanifest");

  eleventyConfig.addShortcode("maincss", function (test) {
    var fs = require('fs');
    var path = process.cwd();
    var filePath = path + "\\main.css";
    if (fs.existsSync(filePath)) {
      var buffer = fs.readFileSync(filePath).toString();
    }
    return buffer;
  });

  return {
    dir: {
      output: "dist"
    }
  }
};

