const fs = require("fs");
const Path = require("path");

module.exports = function (eleventyConfig) {
  eleventyConfig.addWatchTarget("./content")
  eleventyConfig.setWatchThrottleWaitTime(1000);
  eleventyConfig.addPassthroughCopy({ "static-root": "/" });
  eleventyConfig.addPassthroughCopy({ "_data": "_data" });

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

  eleventyConfig.addShortcode("copyAirtableImages", function (page, images) {
    for (image of images) {
      fs.mkdirSync(Path.dirname(page.outputPath), { recursive: true });
      fs.copyFileSync(
        Path.join(image.newFilePath),
        Path.join(Path.dirname(page.outputPath), Path.basename(image.newFilePath))
      )
    }

    return ""
  });

  return {
    dir: {
      output: "dist"
    }
  }
};

