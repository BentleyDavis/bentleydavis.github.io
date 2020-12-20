
module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "static-root": "/" });

  eleventyConfig.addShortcode("fileImport", function (fileName) {
    const fs = require('fs');
    const path = require('path');
    const dirPath = process.cwd();
    const filePath = path.join(dirPath,"_includes","shortcodes", fileName);
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

