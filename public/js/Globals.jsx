
/**
 * Constants and helper functions I want available to all.
 */
export class Globals {
  static COMM_TYPE_NEWCHAR = 0;
  static COMM_TYPE_NEWPLACE = 1;
  static COMM_TYPE_NEWEVENT = 2;
  static COMM_TYPE_NEWWIKI = 3;
  static COMM_TYPE_NEWLINK = 4;
  static COMM_TYPE_DELETEASSOC = 5;
  static SERVICE_URL = '/api';
  static ASSOCIATION_TYPE_CHARACTER = 0;
  static ASSOCIATION_TYPE_PLACE = 1;
  static ASSOCIATION_TYPE_EVENT = 2;

  /**
   * Returns the standard request headers required by the API
   *
   * @return {Headers}
   */
  static getHeaders() {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Authorization', 'Bearer ' + window.tokenID);
    return headers;
  }

  /**
   * Extracts the last subdirectory of a url
   *
   * @param {string} url
   * @return {string}
   */
  static getLastDirectory(url) {
    return url.substring(url.lastIndexOf('/') + 1);
  }

  /**
   * Generate a random integer between 2 values (inclusive)
   *
   * @param {Number} min
   * @param {Number} max
   * @return {Number}
   */
  static randomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  /**
   * Generate a dummy placeholder title for story creation UI
   *
   * @return {string}
   */
  static generateStoryTitle() {
    const infinitives = ['', 'The', 'The Tale of', 'The Story of', 'The Case of'];
    const adjectives = ['', 'Bad', 'Good', 'Evil', 'Broken', 'Warm', 'Hot', 'Cold', 'Melancholy', 'Sad', 'Deviant',
      'Final', 'Long', 'Brief', 'Odious', 'Immaculate', 'Adorable', 'Amused', 'Awful', 'Better',
      'Bloody', 'Blushing', 'Brave', 'Courageous', 'Cute', 'Dead', 'Delightful', 'Doubtful', 'Elegant',
      'Fantastic', 'Fine', 'Glorious', 'Graceful', 'Grumpy', 'Horrible', 'Ill', 'Jolly', 'Modern', 'Lucky',
      'Naughty', 'Outrageous', 'Perfect', 'Precious', 'Putrid', 'Rich', 'Shimmering', 'Sleepy', 'Spotless', 'Stupid',
      'Tender', 'Thankful', 'Ugly', 'Wicked', 'Wrong', 'Weary', 'Tasty', 'Thoughtless', 'Scary', 'Proud', 'Mysterious',
      'Lovely', 'Innocent', 'Homeless', 'Gorgeous', 'Gentle', 'Filthy', 'Enchanting', 'Clever', 'Red', 'Black', 'White', 'Gray', 'Blue'];
    const nouns = ['Time', 'Year', 'People', 'Way', 'Day', 'Man', 'Thing', 'Woman', 'Life', 'Child', 'World', 'School', 'State', 'Family',
      'Student', 'Country', 'Problem', 'Hand', 'Place', 'Week', 'Company', 'System', 'Program', 'Question', 'Job', 'Number',
      'Night', 'Point', 'Home', 'Water', 'Room', 'Mother', 'Fortune', 'Month', 'Right', 'Study', 'Book', 'Eye', 'Word', 'Business',
      'Issue', 'Kind', 'Head', 'House', 'Friend', 'Father', 'Power', 'Hour', 'Game', 'Line', 'Law', 'Car', 'City', 'Name',
      'Team', 'Minute', 'Idea', 'Kid', 'Body', 'Face', 'Level', 'Door', 'Art', 'War', 'Party', 'Morning', 'Reason', 'Girl',
      'Boy', 'Moment', 'Air', 'Teacher', 'Force'];
    const infinitive = infinitives[this.randomNumber(0, infinitives.length-1)] + ' ';
    const adjective = adjectives[this.randomNumber(0, adjectives.length-1)] + ' ';
    const noun = nouns[this.randomNumber(0, nouns.length-1)];

    let string = infinitive;
    if (adjective.length && infinitive != 'The ') {
      let adjInf = '';
      switch (this.randomNumber(0, 1)) {
        case 0:
          adjInf = 'the ';
          break;
        default:
          adjInf = 'a ';
          if ((/^[aeiou]$/i).test(adjective[0].toLowerCase())) {
            adjInf = 'an ';
          }
      }
      if (!string.length || string.length == 1) {
        string = string.trim() + adjInf.substring(0, 1).toUpperCase() + adjInf.substring(1, adjInf.length);
      } else {
        string += adjInf;
      }
    }
    return string + adjective + noun;
  }
}
