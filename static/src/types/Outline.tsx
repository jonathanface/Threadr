export enum OutlineTemplate {
  threeAct = "threeAct",
  fiveAct = "fiveAct",
  hero = "heroJourney",
  custom = "custom",
}

export interface OutlineSection {
  header: string;
  description: string;
  place: number;
  text: string;
  chapters?: string[];
  status: StageStatus;
}

export interface Outline {
  storyID: string;
  template?: OutlineTemplate;
  sections: OutlineSection[];
  unassigned?: string[];
}

export type StageStatus = "Draft" | "Revising" | "Done";
