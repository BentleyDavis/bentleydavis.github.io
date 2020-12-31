const fs = require("fs");
const Path = require("path");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "static-root": "/" });

  eleventyConfig.addShortcode("formatDate", function (date) {
    return "" + date.toLocaleDateString(
      "en-US",
      { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
    ) + "";
  });

  eleventyConfig.addShortcode("copyImages", function (page, img) {
    const files = fs.readdirSync(Path.dirname(page.inputPath))
    for (file of files) {
      if (
        file.endsWith(".png") ||
        file.endsWith(".jpeg") ||
        file.endsWith(".jpg") ||
        file.endsWith(".gif")
        ) {
        fs.mkdirSync(Path.dirname(page.outputPath), { recursive: true });
        fs.copyFileSync(
          Path.join(Path.dirname(page.inputPath), file),
          Path.join(Path.dirname(page.outputPath), file)
        )
      }
    }
    return ""
  });

  return {
    dir: {
      output: "dist"
    }
  }
};

