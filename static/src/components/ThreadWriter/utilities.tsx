export const UCWords = (str: string) => {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export const UpdateChapterQueryStringParameter = (chapterID: string) => {
  const newurl =
    window.location.protocol +
    "//" +
    window.location.host +
    window.location.pathname +
    "?chapter=" +
    chapterID;
  window.history.pushState({ path: newurl }, "", newurl);
};
