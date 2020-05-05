
module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "static-root": "/" });
  eleventyConfig.addPassthroughCopy("static");

  eleventyConfig.addShortcode("fileImport", function (file) {
    var fs = require('fs');
    var path = process.cwd();
    var filePath = path + "\\_includes\\shortcodes\\" + file;
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

