
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

  eleventyConfig.addShortcode("fileImport", function (file) {
    var fs = require('fs');
    var path = process.cwd();
    var filePath = path + "\\" + file;
    if (fs.existsSync(filePath)) {
      var buffer = fs.readFileSync(filePath).toString();
    }
    return buffer;
  });

  eleventyConfig.addShortcode("formatDate", function(date) { 
    return "" + date.toLocaleDateString(
      "en-US",
      { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
    ) + "";
  });

  return {
    dir: {
      output: "dist"
    }
  }
};

