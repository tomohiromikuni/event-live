import 'server-only';
import { db } from './db';
import { listCategories, listGenres } from './queries';

export function formData(eventId?: number) {
  const genres = listGenres();
  const categories = listCategories();
  const gc = db().prepare('SELECT genre_id, category_id FROM genre_categories').all() as { genre_id: number; category_id: number }[];
  const genreDefaults: Record<number, number[]> = {};
  for (const r of gc) (genreDefaults[r.genre_id] ??= []).push(r.category_id);
  const customCategoryIds = eventId
    ? (db().prepare('SELECT category_id FROM event_categories WHERE event_id = ?').all(eventId) as { category_id: number }[]).map((r) => r.category_id)
    : [];
  return { genres, categories, genreDefaults, customCategoryIds };
}
