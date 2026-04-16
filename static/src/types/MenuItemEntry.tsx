export interface MenuItemEntry {
  name: string;
  command?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  subItems?: MenuItemEntry[];
}
