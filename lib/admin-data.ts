import 'server-only';
import { q } from './db';
import { listCategories, listGenres } from './queries';

export async function formData(eventId?: number) {
  const [genres, categories, gc] = await Promise.all([
    listGenres(),
    listCategories(),
    q<{ genre_id: number; category_id: number }>('SELECT genre_id, category_id FROM genre_categories'),
  ]);
  const genreDefaults: Record<number, number[]> = {};
  for (const r of gc) (genreDefaults[r.genre_id] ??= []).push(r.category_id);
  const customCategoryIds = eventId
    ? (await q<{ category_id: number }>('SELECT category_id FROM event_categories WHERE event_id = $1', [eventId])).map((r) => r.category_id)
    : [];
  return { genres, categories, genreDefaults, customCategoryIds };
}
