
module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "static-root": "/" });

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

