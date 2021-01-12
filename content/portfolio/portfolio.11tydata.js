module.exports = {
    eleventyComputed: {
        title: data => {
            return data.item.title;
          },
        tags: (data) => {
            return data.item.Tags;
          }
    }
  };