export enum OutlineType {
    threeAct = "threeAct",
    fiveAct = "fiveAct",
    hero = "heroJourney"
}

export interface OutlineSection {
    header: string;
    description: string;
    place: number;
    text: string;
    chapters?: string[];
}

export interface Outline {
    storyID: string;
    type?: OutlineType;
    sections: OutlineSection[];
}