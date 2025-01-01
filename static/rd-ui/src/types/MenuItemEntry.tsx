export interface MenuItemEntry {
  name: string;
  command?: (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => void;
  subItems?: MenuItemEntry[];
}
