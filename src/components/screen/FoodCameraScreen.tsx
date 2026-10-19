import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { analyzeFoodPhoto, type AnalyzedFood } from '@/services/api/food-analysis';
import { createLifeItem } from '@/services/api/life-items';
import { deleteGalleryPhoto, getGalleryPhotos, saveGalleryPhoto, type GalleryPhoto } from '@/services/photo-gallery';
import { useAppTheme } from '@/state/ThemeProvider';
import type { MealType } from '@/types/life-item';

interface FoodDraft {
  name: string;
  portion: string;
  calories: string;
  sugar: string;
  fat: string;
}

const MAX_PHOTO_EDGE = 1280;

function makeDraft(food: AnalyzedFood): FoodDraft {
  return {
    name: food.name,
    portion: String(Math.round(food.portion_g)),
    calories: String(food.calories),
    sugar: String(Math.round(food.sugar_g * 10) / 10),
    fat: String(Math.round(food.fat_g * 10) / 10),
  };
}

function inferredMealType(date: Date): MealType {
  const hour = date.getHours();
  if (hour < 11) return 'Breakfast';
  if (hour < 16) return 'Lunch';
  if (hour < 21) return 'Dinner';
  return 'Snack';
}

export default function FoodCameraScreen() {
  const { colors } = useAppTheme();
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [gallery, setGallery] = useState<GalleryPhoto[]>([]);
  const [drafts, setDrafts] = useState<FoodDraft[]>([]);
  const [selectedGalleryPhoto, setSelectedGalleryPhoto] = useState<GalleryPhoto | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refreshGallery = useCallback(async () => {
    try {
      setGallery(await getGalleryPhotos());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load the in-app gallery.');
    }
  }, []);

  useFocusEffect(useCallback(() => { void refreshGallery(); }, [refreshGallery]));

  const takePhoto = async () => {
    setError('');
    setMessage('');
    setDrafts([]);
    setSelectedGalleryPhoto(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('Allow camera access in your device settings to take a photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (result.canceled) return;
      setPhoto(result.assets[0] ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not open the camera.');
    }
  };

  const choosePhoto = async () => {
    setError('');
    setMessage('');
    setDrafts([]);
    setSelectedGalleryPhoto(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (result.canceled) return;
      setPhoto(result.assets[0] ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not open the photo gallery.');
    }
  };

  const savePhotoToGallery = async () => {
    if (!photo) return;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await saveGalleryPhoto(photo.uri);
      setPhoto(null);
      setSelectedGalleryPhoto(saved);
      setMessage('Photo saved to your private in-app gallery on this device.');
      await refreshGallery();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this photo to the in-app gallery.');
    } finally {
      setIsSaving(false);
    }
  };

  const analyzePhoto = () => {
    if (!photo) return;
    Alert.alert(
      'Send this photo to Google Gemini?',
      'A resized copy of this photo will be sent through your backend to Google Gemini for food recognition. This free-tier service may use submitted content to improve Google products. Nutrition values are estimates, not medical advice. Continue only if you are comfortable uploading this photo.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send and analyze', onPress: () => { void runAnalysis(); } },
      ],
    );
  };

  const runAnalysis = async () => {
    if (!photo) return;
    setIsAnalyzing(true);
    setError('');
    setMessage('');
    setDrafts([]);
    try {
      const scale = MAX_PHOTO_EDGE / Math.max(photo.width, photo.height);
      const actions = scale < 1 ? [{ resize: { width: Math.round(photo.width * scale), height: Math.round(photo.height * scale) } }] : [];
      const resized = await ImageManipulator.manipulateAsync(photo.uri, actions, {
        compress: 0.68,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
      if (!resized.base64) throw new Error('Could not prepare this photo for analysis.');
      const result = await analyzeFoodPhoto(resized.base64, 'image/jpeg');
      if (!result.is_food) {
        const saved = await saveGalleryPhoto(resized.uri);
        setPhoto(null);
        setMessage('This does not look like a food photo. It was saved to your private in-app gallery on this device.');
        await refreshGallery();
        setSelectedGalleryPhoto(saved);
        return;
      }
      setDrafts(result.foods.map(makeDraft));
      if (!result.foods.length) throw new Error('No foods could be identified. Try a clearer photo.');
      setMessage('Review and adjust the estimated portions and nutrition before adding this meal.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not analyze this photo.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateFood = (index: number, field: keyof FoodDraft, value: string) => {
    setDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  };

  const saveMeal = async () => {
    if (!drafts.length || drafts.some((food) =>
      !food.name.trim() || !food.portion.trim() || !food.calories.trim() || !food.sugar.trim() || !food.fat.trim()
    )) {
      setError('Check each food name, portion, calories, sugar, and fat before saving.');
      return;
    }
    const foods = drafts.map((food) => ({
      name: food.name.trim(),
      portion: Number(food.portion),
      calories: Number(food.calories),
      sugar: Number(food.sugar),
      fat: Number(food.fat),
    }));
    if (foods.some((food) =>
      !Number.isFinite(food.portion) || food.portion <= 0 ||
      !Number.isInteger(food.calories) || food.calories < 0 ||
      !Number.isFinite(food.sugar) || food.sugar < 0 ||
      !Number.isFinite(food.fat) || food.fat < 0
    )) {
      setError('Check each food name, portion, calories, sugar, and fat before saving.');
      return;
    }
    const calories = foods.reduce((total, food) => total + food.calories, 0);
    const sugar = Math.round(foods.reduce((total, food) => total + food.sugar, 0) * 10) / 10;
    const fat = Math.round(foods.reduce((total, food) => total + food.fat, 0) * 10) / 10;
    if (calories > 10000 || sugar > 1000 || fat > 1000) {
      setError('The combined nutrition values exceed the meal limits. Adjust the estimates and try again.');
      return;
    }
    const title = `Photo meal: ${foods.map((food) => food.name).join(', ')}`.slice(0, 120);
    const notes = `Photo estimate; review serving sizes. ${foods.map((food) =>
      `${food.name} (${food.portion} g: ${food.calories} kcal, ${food.sugar} g sugar, ${food.fat} g fat)`
    ).join('; ')}`.slice(0, 1000);
    setIsSaving(true);
    setError('');
    try {
      await createLifeItem({
        kind: 'meal',
        title,
        notes,
        occurred_at: new Date().toISOString(),
        calories,
        sugar_g: sugar,
        fat_g: fat,
        meal_type: inferredMealType(new Date()),
      });
      setDrafts([]);
      setPhoto(null);
      setMessage('Meal saved with your reviewed nutrition estimates.');
      router.navigate('/meals');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this meal. Your review is still here; please retry.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeletePhoto = (item: GalleryPhoto) => {
    Alert.alert('Remove this photo?', 'This deletes the photo from the in-app gallery on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void deleteGalleryPhoto(item).then(() => {
            setGallery((items) => items.filter((photoItem) => photoItem.id !== item.id));
            if (selectedGalleryPhoto?.id === item.id) setSelectedGalleryPhoto(null);
            setError('');
          }).catch((failure: unknown) => {
            setError(failure instanceof Error ? failure.message : 'Could not remove this photo.');
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerIcon}><Ionicons name="camera-outline" size={22} color={colors.primary} /></View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Food camera</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Scan a meal or save a photo</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.disclosure, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="information-circle-outline" size={19} color={colors.primary} />
          <Text style={[styles.disclosureText, { color: colors.text }]}>
            Photos are uploaded to Google only after you tap Analyze and confirm. The backend needs a Gemini API key for analysis. Non-food photos stay in this app’s private on-device gallery. Nutrition values are estimates; check them before saving.
          </Text>
        </View>

        <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {photo ? (
            <Image source={{ uri: photo.uri }} contentFit="cover" style={styles.preview} />
          ) : selectedGalleryPhoto ? (
            <Image source={{ uri: selectedGalleryPhoto.uri }} contentFit="cover" style={styles.preview} />
          ) : (
            <View style={[styles.placeholder, { backgroundColor: colors.surfaceAlt }]}>
              <View style={[styles.placeholderIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="camera-outline" size={35} color={colors.primary} />
              </View>
              <Text style={[styles.placeholderTitle, { color: colors.text }]}>Take a photo to get started</Text>
              <Text style={[styles.placeholderSubtitle, { color: colors.muted }]}>Food is analyzed; other photos go to your private gallery.</Text>
            </View>
          )}
          <View style={styles.photoActions}>
            <Pressable accessibilityRole="button" disabled={isAnalyzing || isSaving} onPress={() => void takePhoto()}
              style={[styles.cameraButton, { backgroundColor: colors.primary }, (isAnalyzing || isSaving) && styles.disabled]}>
              <Ionicons name="camera" size={18} color="#FFFFFF" />
              <Text style={styles.cameraButtonText}>{photo ? 'Take photo' : 'Open camera'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={isAnalyzing || isSaving} onPress={() => void choosePhoto()}
              style={[styles.galleryButton, { backgroundColor: colors.surfaceAlt }, (isAnalyzing || isSaving) && styles.disabled]}>
              <Ionicons name="images-outline" size={18} color={colors.primary} />
              <Text style={[styles.galleryButtonText, { color: colors.primary }]}>Choose image</Text>
            </Pressable>
          </View>
          {photo ? (
            <View style={styles.photoActions}>
              <Pressable accessibilityRole="button" disabled={isAnalyzing || isSaving} onPress={analyzePhoto}
              style={[styles.analyzeButton, { backgroundColor: colors.surfaceAlt }, isAnalyzing && styles.disabled]}>
              {isAnalyzing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sparkles-outline" size={18} color={colors.primary} />}
              <Text style={[styles.analyzeText, { color: colors.primary }]}>{isAnalyzing ? 'Analyzing photo…' : 'Analyze photo'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={isAnalyzing || isSaving} onPress={() => void savePhotoToGallery()}
                style={[styles.savePhotoButton, { borderColor: colors.border }, (isAnalyzing || isSaving) && styles.disabled]}>
                {isSaving ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="download-outline" size={18} color={colors.primary} />}
                <Text style={[styles.analyzeText, { color: colors.primary }]}>{isSaving ? 'Saving…' : 'Save privately'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {message ? <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.green }]}>{message}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}

        {drafts.length ? (
          <View style={styles.reviewSection}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Review detected food</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>Edit the model’s estimates before saving</Text>
              </View>
              <Ionicons name="nutrition-outline" size={21} color={colors.primary} />
            </View>
            {drafts.map((food, index) => (
              <View key={`${index}-${food.name}`} style={[styles.foodCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.foodLabel, { color: colors.muted }]}>FOOD {index + 1}</Text>
                <TextInput accessibilityLabel={`Food ${index + 1} name`} value={food.name} onChangeText={(value) => updateFood(index, 'name', value)}
                  maxLength={100} placeholder="Food name" placeholderTextColor={colors.muted}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
                <View style={styles.nutritionRow}>
                  <View style={styles.nutritionField}>
                    <Text style={[styles.inputLabel, { color: colors.muted }]}>Portion g</Text>
                    <TextInput accessibilityLabel={`Food ${index + 1} portion in grams`} value={food.portion} onChangeText={(value) => updateFood(index, 'portion', value)}
                      keyboardType="decimal-pad" style={[styles.nutritionInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
                  </View>
                  <View style={styles.nutritionField}>
                    <Text style={[styles.inputLabel, { color: colors.muted }]}>Calories</Text>
                    <TextInput accessibilityLabel={`Food ${index + 1} calories`} value={food.calories} onChangeText={(value) => updateFood(index, 'calories', value)}
                      keyboardType="number-pad" style={[styles.nutritionInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
                  </View>
                  <View style={styles.nutritionField}>
                    <Text style={[styles.inputLabel, { color: colors.muted }]}>Sugar g</Text>
                    <TextInput accessibilityLabel={`Food ${index + 1} sugar grams`} value={food.sugar} onChangeText={(value) => updateFood(index, 'sugar', value)}
                      keyboardType="decimal-pad" style={[styles.nutritionInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
                  </View>
                  <View style={styles.nutritionField}>
                    <Text style={[styles.inputLabel, { color: colors.muted }]}>Fat g</Text>
                    <TextInput accessibilityLabel={`Food ${index + 1} fat grams`} value={food.fat} onChangeText={(value) => updateFood(index, 'fat', value)}
                      keyboardType="decimal-pad" style={[styles.nutritionInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
                  </View>
                </View>
              </View>
            ))}
            <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void saveMeal()}
              style={[styles.saveButton, { backgroundColor: colors.primary }, isSaving && styles.disabled]}>
              {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="checkmark-circle-outline" size={19} color="#FFFFFF" />}
              <Text style={styles.saveText}>{isSaving ? 'Saving meal…' : 'Add reviewed meal to Meals'}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>In-app gallery</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{gallery.length} saved non-food {gallery.length === 1 ? 'photo' : 'photos'} · stored on this device</Text>
          </View>
          <Ionicons name="images-outline" size={21} color={colors.primary} />
        </View>
        {gallery.length ? (
          <View style={styles.galleryGrid}>
            {gallery.map((item) => (
              <View key={item.id} style={[styles.galleryItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Pressable accessibilityRole="button" accessibilityLabel={`View photo saved ${new Date(item.savedAt).toLocaleDateString()}`}
                  onPress={() => { setSelectedGalleryPhoto(item); setPhoto(null); setDrafts([]); }}>
                  <Image source={{ uri: item.uri }} contentFit="cover" style={styles.thumbnail} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Remove photo from in-app gallery" hitSlop={8}
                  onPress={() => confirmDeletePhoto(item)} style={styles.removePhoto}>
                  <Ionicons name="close-circle" size={22} color={colors.red} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.emptyGallery, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Non-food photos you scan will appear here. They are not saved to your public phone gallery.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 19, paddingTop: 10, paddingBottom: 12 },
  headerIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6558F51A' },
  headerCopy: { flex: 1 },
  title: { fontSize: 21, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 3 },
  content: { paddingHorizontal: 18, paddingBottom: 35 },
  disclosure: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, borderRadius: 16, marginBottom: 14 },
  disclosureText: { flex: 1, fontSize: 11, lineHeight: 17 },
  previewCard: { borderWidth: 1, borderRadius: 22, padding: 12 },
  preview: { width: '100%', height: 260, borderRadius: 15, backgroundColor: '#10121A' },
  placeholder: { minHeight: 220, borderRadius: 15, alignItems: 'center', justifyContent: 'center', padding: 20 },
  placeholderIcon: { width: 68, height: 68, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  placeholderTitle: { fontSize: 15, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  placeholderSubtitle: { fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 6 },
  photoActions: { flexDirection: 'row', gap: 8, marginTop: 11 },
  cameraButton: { flex: 1, minHeight: 47, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  cameraButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  galleryButton: { flex: 1, minHeight: 47, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  galleryButtonText: { fontSize: 13, fontWeight: '800' },
  analyzeButton: { flex: 1, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  savePhotoButton: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  analyzeText: { fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  message: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  error: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  reviewSection: { marginTop: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 21, marginBottom: 11 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionSubtitle: { fontSize: 10, marginTop: 3 },
  foodCard: { borderWidth: 1, borderRadius: 17, padding: 12, marginBottom: 9 },
  foodLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 10, fontSize: 13 },
  nutritionRow: { flexDirection: 'row', gap: 7, marginTop: 9 },
  nutritionField: { flex: 1 },
  inputLabel: { fontSize: 9, fontWeight: '700', marginBottom: 5 },
  nutritionInput: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 9, textAlign: 'center', fontSize: 12 },
  saveButton: { minHeight: 49, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 5 },
  saveText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  galleryItem: { width: '31%', aspectRatio: 1, borderWidth: 1, borderRadius: 13, overflow: 'hidden' },
  thumbnail: { width: '100%', height: '100%' },
  removePhoto: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 12 },
  emptyGallery: { borderWidth: 1, borderRadius: 15, padding: 15 },
  emptyText: { fontSize: 11, lineHeight: 17 },
});
