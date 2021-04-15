
/**
 * Constants and helper functions I want available to all.
 */
export class Globals {
  static COMM_TYPE_NEWCHAR = 0;
  static COMM_TYPE_NEWPLACE = 1;
  static COMM_TYPE_NEWEVENT = 2;
  static COMM_TYPE_NEWWIKI = 3;
  static COMM_TYPE_NEWLINK = 4;
  static SERVICE_URL = '/api';
  static ASSOCIATION_TYPE_CHARACTER = 0;
  static ASSOCIATION_TYPE_PLACE = 1;
  static ASSOCIATION_TYPE_EVENT = 2;
  static TOKEN_ID;

  /**
   * Returns the standard request headers required by the API
   *
   * @return {Headers}
   */
  static getHeaders() {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Authorization', 'Bearer ' + Globals.TOKEN_ID);
    return headers;
  }
}
