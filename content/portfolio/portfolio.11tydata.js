module.exports = {
  eleventyComputed: {
    title: data => {
      return data.item.title;
    },
    tags: (data) => {
      return data.item.Tags;
    },
    img: (data) => {
      return data.page.url + data.item.thumbnail;
    }
  }
};