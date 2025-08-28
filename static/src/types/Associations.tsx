export interface AssociationDetails {
  aliases: string;
  case_sensitive: boolean;
  extended_description: string;
}

export enum AssociationType {
  character = "character",
  event = "event",
  place = "place",
  item = "item",
}

export interface Association {
  association_id: string;
  association_name: string;
  association_type: string;
  short_description: string;
  portrait: string;
  details: AssociationDetails;
  aliases: string;
  case_sensitive: boolean;
}

export interface SimplifiedAssociation {
  association_id: string;
  association_name: string;
  association_type: string;
  short_description: string;
  portrait: string;
  aliases: string;
  case_sensitive: boolean;
}
