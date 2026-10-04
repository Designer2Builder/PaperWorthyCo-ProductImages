export interface Photo {
  id: number;
  display_name: string;
  original_filename: string;
  series_name: string;
  series_release_date: string | null;
  colors: string[];
  description: string;
  photo_type: string;
  page_number: number | null;
  notebook_type: string;
  notebook_count: string;
  interior_pages: string;
  retail_price: number | null;
  wholesale_price: number | null;
  wholesale_minimum: number | null;
  cogs: number | null;
  inventory: number | null;
  inventory_check_date: string | null;
  raw_material: string;
  file_ext: string;
  file_size: number;
  photo_url: string;
  thumbnail_url: string;
  width: number | null;
  height: number | null;
  original_created_at: string | null;
  imported_at: string;
  updated_at: string;
}

export interface IncomingFile {
  /** Blob pathname, e.g. `incoming/<uuid>/IMG_1234.jpg`. */
  pathname: string;
  name: string;
  size: number;
}
