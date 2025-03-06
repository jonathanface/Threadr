import { createContext } from "react";
import { SimplifiedAssociation } from "../types/Associations";


type AssociationsContextType = {
    associations: SimplifiedAssociation[];
    setAssociations: React.Dispatch<React.SetStateAction<SimplifiedAssociation[]>>;
};

export const AssociationsContext = createContext<AssociationsContextType | undefined>(
    undefined
);
