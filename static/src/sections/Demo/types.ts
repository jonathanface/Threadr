export interface DemoAssociation {
  client_id: string;
  name: string;
  type: "character" | "place" | "event";
  short_description: string;
  extended_description: string;
}

export interface DemoDraft {
  version: 1;
  title: string;
  lexical_state: string;
  associations: DemoAssociation[];
  updated_at: string;
}
