export type ReportOption = { value: string; label: string; level: number };

export type Genre = {
  id: number; slug: string; name: string; icon: string; color: string; info_fields: string; sort: number;
};

export type Category = {
  id: number; slug: string; name: string; icon: string; color: string;
  report_type_id: number | null; sort: number;
  options: ReportOption[]; // 投稿の選択肢（投稿対象外なら空）
};

export type EventRow = {
  id: number; slug: string; name: string; genre_id: number;
  prefecture: string; city: string; venue_name: string; address: string;
  lat: number; lng: number; zoom: number;
  start_date: string; end_date: string; time_text: string;
  summary: string; organizer: string; official_url: string; access: string;
  nearest_station: string; traffic_info: string; parking_info: string; ticket_info: string;
  extra_info: string; status: 'scheduled' | 'canceled' | 'postponed'; status_note: string;
  image_url: string; image_credit: string;
  is_sample: number; is_featured: number; published: number;
  source_url: string; source_checked_at: string;
  map_style: string;
  map_w: number; map_h: number;
  map_mode: 'canvas' | 'geo';
  created_at: number; updated_at: number;
};

export type EventCard = EventRow & { genre_name: string; genre_icon: string; genre_slug: string; genre_color: string; live_count?: number };

export type Spot = { id: number; event_id: number; category_id: number; name: string; note: string; lat: number; lng: number; sort: number };

export type Report = {
  id: number; event_id: number; spot_id: number; value: string; label: string; level: number;
  created_at: number; flag_count: number;
};
