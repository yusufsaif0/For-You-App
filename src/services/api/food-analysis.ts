import { API_URL } from '@/config/api';

export interface AnalyzedFood {
  name: string;
  portion_g: number;
  calories: number;
  sugar_g: number;
  fat_g: number;
}

export interface FoodAnalysisResult {
  is_food: boolean;
  foods: AnalyzedFood[];
}

function isAnalyzedFood(value: unknown): value is AnalyzedFood {
  if (typeof value !== 'object' || value === null) return false;
  return 'name' in value && typeof value.name === 'string' &&
    'portion_g' in value && typeof value.portion_g === 'number' &&
    'calories' in value && Number.isInteger(value.calories) &&
    'sugar_g' in value && typeof value.sugar_g === 'number' &&
    'fat_g' in value && typeof value.fat_g === 'number';
}

export async function analyzeFoodPhoto(imageBase64: string, mimeType: string): Promise<FoodAnalysisResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${API_URL}/food/analyze`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageBase64, mime_type: mimeType }),
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string'
        ? body.detail
        : 'Could not analyze this photo. Please try again.';
      throw new Error(detail);
    }
    if (
      typeof body !== 'object' || body === null ||
      !('is_food' in body) || typeof body.is_food !== 'boolean' ||
      !('foods' in body) || !Array.isArray(body.foods) || !body.foods.every(isAnalyzedFood) ||
      body.is_food !== (body.foods.length > 0)
    ) {
      throw new Error('The food analysis service returned an invalid response.');
    }
    return { is_food: body.is_food, foods: body.foods };
  } catch (failure) {
    if (failure instanceof Error && failure.name === 'AbortError') {
      throw new Error('Food analysis timed out. Please try again.');
    }
    if (failure instanceof TypeError) {
      throw new Error('Could not connect to the backend. Check your connection and try again.');
    }
    throw failure;
  } finally {
    clearTimeout(timeout);
  }
}
