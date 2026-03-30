export interface ShareLink {
  token: string;
  story_id: string;
  chapter_id?: string;
  author_email: string;
  reader_email: string;
  reader_first_name: string;
  reader_last_name: string;
  created_at: number;
  expires_at: number;
  revoked: boolean;
  comments_enabled: boolean;
  label?: string;
}

export interface Comment {
  comment_id: string;
  share_token: string;
  story_id: string;
  chapter_id: string;
  block_key_id: string;
  anchor_offset: number;
  focus_offset: number;
  anchor_text_snapshot: string;
  reader_email: string;
  reader_first_name: string;
  reader_last_name: string;
  body: string;
  created_at: number;
  resolved: boolean;
  resolved_at?: number;
}

export interface SharedStoryResponse {
  story_id: string;
  title: string;
  description: string;
  image_url: string;
  author_name: string;
  chapters: { id: string; story_id: string; place: number; title: string }[];
  comments_enabled: boolean;
  reader_email: string;
  reader_first_name: string;
  reader_last_name: string;
}

export interface CreateCommentRequest {
  chapter_id: string;
  block_key_id: string;
  anchor_offset: number;
  focus_offset: number;
  anchor_text_snapshot: string;
  body: string;
}
