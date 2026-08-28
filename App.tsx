import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Children, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { createOutfit } from './src/api';
import {
  clearSession,
  loadSession,
  login,
  register,
  saveSession,
  type AuthSession,
} from './src/auth';
import {
  addCategory,
  deleteCategory,
  filterImportedPieces,
  initialLibrary,
  mergeDescriptions,
  mergePieces,
  pieceOutfitIds,
  removeOutfit,
  renameCategory,
  UNCATEGORIZED_OUTFIT,
  UNCATEGORIZED_PIECE,
} from './src/library';
import { loadLibrary, saveLibrary } from './src/storage';
import { deleteStoredImage, isImageStored, resolveImage, storeImage } from './src/image-storage';
import { cropPixels, FULL_CROP, resizeCrop, type CropRect } from './src/crop';
import type {
  ApiPiece,
  Category,
  CategoryKind,
  GridColumns,
  LibraryState,
  OutfitApiResult,
  SavedOutfit,
  SavedPiece,
  ThemePreference,
} from './src/types';

type Tab = 'photo' | 'outfits' | 'pieces' | 'settings';
type IconName = ComponentProps<typeof Ionicons>['name'];
const tabs: { key: Tab; label: string; icon: IconName; activeIcon: IconName }[] = [
  { key: 'photo', label: 'Camera', icon: 'camera-outline', activeIcon: 'camera' },
  { key: 'outfits', label: 'Outfits', icon: 'woman-outline', activeIcon: 'woman' },
  { key: 'pieces', label: 'Pieces', icon: 'shirt-outline', activeIcon: 'shirt' },
  { key: 'settings', label: 'Settings', icon: 'options-outline', activeIcon: 'options' },
];
type SelectedPhoto = {
  uri: string;
  width: number;
  height: number;
  fileName?: string | null;
  mimeType?: string | null;
  file?: File;
};

const pieceCategoryMap: Record<string, string> = {
  top: 'piece-tops',
  bottom: 'piece-bottoms',
  dress: 'piece-dresses',
  outerwear: 'piece-outerwear',
  footwear: 'piece-footwear',
  bag: 'piece-bags',
  accessory: 'piece-accessories',
};

function CategoryChips({
  categories,
  selected,
  onSelect,
}: {
  categories: Category[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.chips}>
      {categories.map((category) => {
        const active = selected === category.id;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`Use ${category.name} category${active ? ', selected' : ''}`}
            key={category.id}
            onPress={() => onSelect(category.id)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{category.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StoredImage({ uri, style }: { uri: string; style: StyleProp<ImageStyle> }) {
  const [resolved, setResolved] = useState(uri);
  useEffect(() => {
    let active = true;
    resolveImage(uri)
      .then((next) => {
        if (active) setResolved(next);
      })
      .catch(() => {
        if (active) setResolved(uri);
      });
    return () => {
      active = false;
    };
  }, [uri]);
  return <Image source={{ uri: resolved }} style={style} />;
}

function removeOutfitFromLibrary(library: LibraryState, outfit: SavedOutfit): LibraryState {
  void deleteStoredImage(outfit.image);
  library.pieces
    .filter((piece) => pieceOutfitIds(piece).length === 1 && pieceOutfitIds(piece)[0] === outfit.id)
    .forEach((piece) => {
      void deleteStoredImage(piece.image);
    });
  return removeOutfit(library, outfit.id);
}

async function migrateLibraryImages(library: LibraryState): Promise<LibraryState> {
  const outfits = await Promise.all(
    library.outfits.map(async (outfit) => ({
      ...outfit,
      image: isImageStored(outfit.image) ? outfit.image : await storeImage(outfit.image, outfit.id),
    })),
  );
  const pieces = await Promise.all(
    library.pieces.map(async (piece) => ({
      ...piece,
      image: isImageStored(piece.image) ? piece.image : await storeImage(piece.image, piece.id),
    })),
  );
  return { ...library, outfits, pieces };
}

type CropEdge = 'left' | 'right' | 'top' | 'bottom';

function CropHandle({
  edge,
  crop,
  imageWidth,
  imageHeight,
  disabled,
  onChange,
}: {
  edge: CropEdge;
  crop: CropRect;
  imageWidth: number;
  imageHeight: number;
  disabled: boolean;
  onChange: (crop: CropRect) => void;
}) {
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: () => {
          responder.crop = crop;
        },
        onPanResponderMove: (_, gesture) => {
          const start = responder.crop ?? crop;
          const delta =
            edge === 'left' || edge === 'right'
              ? gesture.dx / imageWidth
              : gesture.dy / imageHeight;
          onChange(resizeCrop(start, edge, delta));
        },
      }) as ReturnType<typeof PanResponder.create> & { crop?: CropRect },
    [crop, disabled, edge, imageHeight, imageWidth, onChange],
  );
  const vertical = edge === 'left' || edge === 'right';
  const placement = vertical
    ? {
        left: (edge === 'left' ? crop.left : crop.right) * imageWidth - 22,
        top: crop.top * imageHeight,
        width: 44,
        height: (crop.bottom - crop.top) * imageHeight,
      }
    : {
        left: crop.left * imageWidth,
        top: (edge === 'top' ? crop.top : crop.bottom) * imageHeight - 22,
        width: (crop.right - crop.left) * imageWidth,
        height: 44,
      };
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={`Drag ${edge} crop edge`}
      accessibilityState={{ disabled }}
      pointerEvents={disabled ? 'none' : 'auto'}
      {...responder.panHandlers}
      style={[styles.cropHandle, placement, disabled && { opacity: 0.45 }]}
    >
      <View style={vertical ? styles.cropGripVertical : styles.cropGripHorizontal} />
    </View>
  );
}

function CropEditor({
  photo,
  crop,
  disabled,
  onChange,
}: {
  photo: SelectedPhoto;
  crop: CropRect;
  disabled: boolean;
  onChange: (crop: CropRect) => void;
}) {
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const scale =
    stage.width && stage.height
      ? Math.min(stage.width / photo.width, stage.height / photo.height)
      : 0;
  const imageWidth = Math.max(1, photo.width * scale);
  const imageHeight = Math.max(1, photo.height * scale);
  return (
    <View
      accessibilityLabel="Crop photo"
      accessibilityState={{ disabled }}
      style={styles.cropStage}
      onLayout={(event) => setStage(event.nativeEvent.layout)}
    >
      {!!scale && (
        <View style={[styles.cropImageFrame, { width: imageWidth, height: imageHeight }]}>
          <Image source={{ uri: photo.uri }} resizeMode="stretch" style={styles.cropImage} />
          <View
            pointerEvents="none"
            style={[
              styles.cropShade,
              { left: 0, right: 0, top: 0, height: crop.top * imageHeight },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.cropShade,
              { left: 0, right: 0, top: crop.bottom * imageHeight, bottom: 0 },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.cropShade,
              {
                left: 0,
                width: crop.left * imageWidth,
                top: crop.top * imageHeight,
                height: (crop.bottom - crop.top) * imageHeight,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.cropShade,
              {
                left: crop.right * imageWidth,
                right: 0,
                top: crop.top * imageHeight,
                height: (crop.bottom - crop.top) * imageHeight,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.cropOutline,
              {
                left: crop.left * imageWidth,
                top: crop.top * imageHeight,
                width: (crop.right - crop.left) * imageWidth,
                height: (crop.bottom - crop.top) * imageHeight,
              },
            ]}
          />
          <CropHandle
            edge="left"
            crop={crop}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            disabled={disabled}
            onChange={onChange}
          />
          <CropHandle
            edge="right"
            crop={crop}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            disabled={disabled}
            onChange={onChange}
          />
          <CropHandle
            edge="top"
            crop={crop}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            disabled={disabled}
            onChange={onChange}
          />
          <CropHandle
            edge="bottom"
            crop={crop}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            disabled={disabled}
            onChange={onChange}
          />
        </View>
      )}
    </View>
  );
}

function PhotoPage({
  library,
  setLibrary,
  onSaved,
  authToken,
}: {
  library: LibraryState;
  setLibrary: (next: LibraryState) => void;
  onSaved: () => void;
  authToken: string;
}) {
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [result, setResult] = useState<OutfitApiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outfitCategory, setOutfitCategory] = useState(UNCATEGORIZED_OUTFIT);
  const [pieceCategories, setPieceCategories] = useState<Record<string, string>>({});
  const [pieceMerges, setPieceMerges] = useState<Record<string, string | undefined>>({});
  const [pieceImports, setPieceImports] = useState<Record<string, boolean>>({});

  async function selectPhoto(camera: boolean) {
    setError('');
    setResult(null);
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      const access = camera ? 'camera' : 'photo library';
      if (permission.canAskAgain) setError(`Please allow ${access} access to continue.`);
      else
        Alert.alert(
          `${camera ? 'Camera' : 'Photo library'} access needed`,
          `Fashion Canvas needs ${access} access to select your mirror selfie. You can enable it in iOS Settings.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                void Linking.openSettings();
              },
            },
          ],
        );
      return;
    }
    const response = camera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          allowsEditing: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          allowsEditing: false,
        });
    if (!response.canceled && response.assets[0]) {
      setCrop(FULL_CROP);
      setPhoto(response.assets[0]);
    }
  }

  async function upload() {
    if (!photo || busy) return;
    setBusy(true);
    setError('');
    try {
      const cropped = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ crop: cropPixels(crop, photo.width, photo.height) }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      let uploadPhoto: SelectedPhoto = {
        uri: cropped.uri,
        width: cropped.width,
        height: cropped.height,
        fileName: 'cropped-outfit.jpg',
        mimeType: 'image/jpeg',
      };
      if (Platform.OS === 'web') {
        const blob = await fetch(cropped.uri).then((response) => response.blob());
        uploadPhoto = {
          ...uploadPhoto,
          file: new File([blob], 'cropped-outfit.jpg', { type: 'image/jpeg' }),
        };
      }
      const next = await createOutfit(uploadPhoto, authToken);
      setResult(next);
      setPieceCategories(
        Object.fromEntries(
          next.pieces.map((piece) => [
            piece.id,
            pieceCategoryMap[piece.category] ?? UNCATEGORIZED_PIECE,
          ]),
        ),
      );
      setPieceImports(Object.fromEntries(next.pieces.map((piece) => [piece.id, true])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function saveResult() {
    if (!result || busy) return;
    setBusy(true);
    setError('');
    const outfitId = `outfit-${Date.now()}`;
    const description = result.pieces
      .map((piece) => `${piece.label}: ${piece.description}`)
      .join(' · ');
    const stored: string[] = [];
    try {
      const outfitImage = await storeImage(result.styledOutfit, outfitId);
      stored.push(outfitImage);
      const importedPieces = filterImportedPieces(result.pieces, pieceImports);
      const savedPieces = (
        await Promise.all(
          importedPieces.map(async (piece, index) => {
            const id = `${outfitId}-${index}`;
            const categoryId = pieceCategories[piece.id] ?? UNCATEGORIZED_PIECE;
            const mergeTarget = library.pieces.find(
              (candidate) =>
                candidate.id === pieceMerges[piece.id] && candidate.categoryId === categoryId,
            );
            if (mergeTarget) return null;
            const image = await storeImage(piece.image, id);
            stored.push(image);
            return {
              id,
              outfitIds: [outfitId],
              image,
              label: piece.label,
              description: piece.description,
              aiCategory: piece.category,
              categoryId,
            };
          }),
        )
      ).filter((piece): piece is NonNullable<typeof piece> => piece !== null);
      const mergedPieces = library.pieces.map((saved) => {
        const incoming = importedPieces.filter(
          (piece) =>
            pieceMerges[piece.id] === saved.id &&
            (pieceCategories[piece.id] ?? UNCATEGORIZED_PIECE) === saved.categoryId,
        );
        return incoming.length
          ? {
              ...saved,
              outfitIds: [...new Set([...pieceOutfitIds(saved), outfitId])],
              description: incoming.reduce(
                (description, piece) => mergeDescriptions(description, piece.description),
                saved.description,
              ),
            }
          : saved;
      });
      setLibrary({
        ...library,
        outfits: [
          {
            id: outfitId,
            image: outfitImage,
            description,
            categoryId: outfitCategory,
            createdAt: new Date().toISOString(),
          },
          ...library.outfits,
        ],
        pieces: [...savedPieces, ...mergedPieces],
      });
      setPhoto(null);
      setResult(null);
      setOutfitCategory(UNCATEGORIZED_OUTFIT);
      setPieceMerges({});
      setPieceImports({});
      onSaved();
    } catch (reason) {
      await Promise.all(stored.map(deleteStoredImage));
      setError(reason instanceof Error ? reason.message : 'Could not save images on this device.');
    } finally {
      setBusy(false);
    }
  }

  if (!photo && !result)
    return (
      <View style={styles.cameraLanding}>
        <View style={styles.cameraEmptyStage}>
          <Image
            source={require('./assets/fashion-canvas-mark.png')}
            style={styles.cameraLandingLogo}
          />
          <Text accessibilityRole="header" style={styles.cameraLandingTitle}>
            Add a mirror selfie
          </Text>
          <Text style={styles.cameraLandingCopy}>
            Keep your entire outfit visible from shoulders to shoes.
          </Text>
        </View>
        <View style={styles.cameraControls}>
          <View style={styles.cropInstructionRow}>
            <Ionicons name="crop-outline" size={18} color={colors.muted} />
            <Text style={styles.cropInstruction}>
              You can crop out the background before uploading.
            </Text>
          </View>
          {!!error && (
            <Text accessibilityRole="alert" style={styles.cameraError}>
              {error}
            </Text>
          )}
          <View style={styles.cameraActionRow}>
            <Pressable
              accessibilityRole="button"
              style={styles.cameraSecondaryAction}
              onPress={() => selectPhoto(false)}
            >
              <Ionicons name="images-outline" size={21} color={colors.ink} />
              <Text style={styles.cameraSecondaryText}>Choose photo</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.cameraPrimaryAction}
              onPress={() => selectPhoto(true)}
            >
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Take photo</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );

  if (photo && !result)
    return (
      <View style={styles.cameraWorkspace}>
        <CropEditor photo={photo} crop={crop} disabled={busy} onChange={setCrop} />
        <View style={styles.cameraControls}>
          <View
            style={[
              styles.cropInstructionRow,
              { paddingHorizontal: 8, justifyContent: 'flex-start' },
            ]}
          >
            <Ionicons name="crop-outline" size={18} color={colors.muted} />
            <Text style={[styles.cropInstruction, { flex: 1 }]}>
              {busy
                ? 'Creating your outfit… Cropping and buttons are disabled while the server works.'
                : 'Drag the sides to keep only the outfit. Crop out as much background as possible; only this area is uploaded.'}
            </Text>
          </View>
          {!!error && (
            <Text accessibilityRole="alert" style={styles.cameraError}>
              {error}
            </Text>
          )}
          <View style={styles.cameraActionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose another photo"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              style={[
                styles.cameraSecondaryAction,
                { flex: 0, paddingHorizontal: 14 },
                busy && { opacity: 0.45 },
              ]}
              onPress={() => setPhoto(null)}
            >
              <Ionicons name="close" size={20} color={colors.ink} />
              <Text style={styles.cameraSecondaryText}>Retake</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upload cropped photo"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              style={[
                styles.cameraPrimaryAction,
                { paddingHorizontal: 20 },
                busy && { opacity: 0.6 },
              ]}
              onPress={upload}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={19} color="#fff" />
                  <Text style={styles.primaryButtonText}>Create outfit</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    );

  if (result)
    return (
      <ScrollView style={styles.resultScreen} contentContainerStyle={styles.resultScreenContent}>
        <View style={styles.resultHero}>
          <Image
            accessibilityLabel="Generated outfit"
            source={{ uri: result.styledOutfit }}
            style={styles.resultHeroImage}
          />
        </View>
        <View style={styles.resultBody}>
          <Text style={styles.resultSectionLabel}>OUTFIT CATEGORY</Text>
          <CategoryChips
            categories={library.outfitCategories}
            selected={outfitCategory}
            onSelect={setOutfitCategory}
          />
          <View style={styles.resultSectionHeader}>
            <Text style={styles.resultSectionTitle}>Pieces</Text>
            <Text style={styles.detailCount}>
              {filterImportedPieces(result.pieces, pieceImports).length} of {result.pieces.length}
            </Text>
          </View>
          {result.pieces.map((piece) => {
            const selectedCategory = pieceCategories[piece.id] ?? UNCATEGORIZED_PIECE;
            const imported = pieceImports[piece.id] !== false;
            return (
              <ResultPiece
                key={piece.id}
                piece={piece}
                imported={imported}
                onToggleImport={() => setPieceImports({ ...pieceImports, [piece.id]: !imported })}
                categories={library.pieceCategories}
                selected={selectedCategory}
                mergeCandidates={library.pieces.filter(
                  (candidate) => candidate.categoryId === selectedCategory,
                )}
                mergeTarget={pieceMerges[piece.id]}
                onMerge={(id) => setPieceMerges({ ...pieceMerges, [piece.id]: id })}
                onSelect={(id) => {
                  setPieceCategories({ ...pieceCategories, [piece.id]: id });
                  setPieceMerges({ ...pieceMerges, [piece.id]: undefined });
                }}
              />
            );
          })}
          {!!error && (
            <Text accessibilityRole="alert" style={styles.cameraError}>
              {error}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            style={[styles.resultSaveButton, busy && { opacity: 0.6 }]}
            onPress={saveResult}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={21} color="#fff" />
                <Text style={styles.primaryButtonText}>Save outfit and pieces</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    );

  return null;
}

function ResultPiece({
  piece,
  imported,
  onToggleImport,
  categories,
  selected,
  mergeCandidates,
  mergeTarget,
  onSelect,
  onMerge,
}: {
  piece: ApiPiece;
  imported: boolean;
  onToggleImport: () => void;
  categories: Category[];
  selected: string;
  mergeCandidates: SavedPiece[];
  mergeTarget?: string;
  onSelect: (id: string) => void;
  onMerge: (id?: string) => void;
}) {
  return (
    <View style={[styles.pieceCard, !imported && styles.pieceCardExcluded]}>
      <StoredImage uri={piece.image} style={styles.pieceImage} />
      <View style={styles.cardBody}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: imported }}
          accessibilityLabel={`${imported ? 'Do not import' : 'Import'} ${piece.label}`}
          onPress={onToggleImport}
          style={styles.importToggle}
        >
          <Ionicons
            name={imported ? 'checkbox' : 'square-outline'}
            size={22}
            color={imported ? colors.rust : colors.muted}
          />
          <Text style={styles.importToggleText}>{imported ? 'Import piece' : 'Not imported'}</Text>
        </Pressable>
        <Text style={styles.aiLabel}>{piece.category}</Text>
        <Text style={styles.cardTitle}>{piece.label}</Text>
        <Text style={styles.description}>{piece.description}</Text>
        {imported && (
          <>
            <CategoryChips categories={categories} selected={selected} onSelect={onSelect} />
            {!!mergeCandidates.length && (
              <View style={styles.mergeSection}>
                <Text style={styles.mergeLabel}>MERGE WITH EXISTING · OPTIONAL</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.mergeOptions}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${piece.label} as new piece`}
                    onPress={() => onMerge(undefined)}
                    style={[styles.mergeOption, !mergeTarget && styles.mergeOptionActive]}
                  >
                    <Text style={styles.mergeNewMark}>＋</Text>
                    <Text style={styles.mergeOptionText}>New piece</Text>
                  </Pressable>
                  {mergeCandidates.map((candidate) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Merge ${piece.label} with ${candidate.label}`}
                      key={candidate.id}
                      onPress={() => onMerge(candidate.id)}
                      style={[
                        styles.mergeOption,
                        mergeTarget === candidate.id && styles.mergeOptionActive,
                      ]}
                    >
                      <StoredImage uri={candidate.image} style={styles.mergeOptionImage} />
                      <Text numberOfLines={2} style={styles.mergeOptionText}>
                        {candidate.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

type CategoryEditor = { mode: 'add' } | { mode: 'edit'; category: Category };

function CategoryAccordion({
  category,
  images,
  count,
  expanded,
  onToggle,
  onEdit,
  children,
  emptyText,
}: {
  category: Category;
  images: string[];
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  children: ReactNode;
  emptyText: string;
}) {
  return (
    <View style={styles.accordion}>
      <View style={styles.accordionHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${category.name}`}
          onPress={onToggle}
          style={styles.accordionToggle}
        >
          <Text style={styles.accordionIcon}>{expanded ? '−' : '+'}</Text>
          <Text numberOfLines={1} style={styles.accordionName}>
            {category.name}
          </Text>
          {!!images.length && (
            <View
              accessibilityLabel={`${images.length} item previews`}
              style={styles.categoryPreviews}
            >
              {images.slice(0, 3).map((uri, index) => (
                <StoredImage
                  key={`-`}
                  uri={uri}
                  style={[styles.categoryPreview, index > 0 && styles.categoryPreviewOverlap]}
                />
              ))}
            </View>
          )}
          <Text style={styles.accordionCount}>{count}</Text>
        </Pressable>
        {onEdit && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${category.name}`}
            onPress={onEdit}
            style={styles.editButton}
          >
            <Text style={styles.action}>Edit</Text>
          </Pressable>
        )}
      </View>
      {expanded && (
        <View style={styles.accordionBody}>
          {count ? children : <Text style={styles.emptyCategory}>{emptyText}</Text>}
        </View>
      )}
    </View>
  );
}

function CardGrid({ columns, children }: { columns: GridColumns; children: ReactNode }) {
  const cards = Children.toArray(children);
  const rows = Array.from({ length: Math.ceil(cards.length / columns) }, (_, index) =>
    cards.slice(index * columns, index * columns + columns),
  );
  return (
    <View style={styles.grid}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.gridRow}>
          {row}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={`empty-${index}`} style={styles.gridPlaceholder} />
          ))}
        </View>
      ))}
    </View>
  );
}

function LibraryEmptyState({ kind }: { kind: 'outfits' | 'pieces' }) {
  const outfits = kind === 'outfits';
  return (
    <View
      style={{
        minHeight: 280,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 30,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.line,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
        }}
      >
        <Ionicons
          name={outfits ? 'woman-outline' : 'shirt-outline'}
          size={34}
          color={colors.rust}
        />
      </View>
      <Text style={{ fontFamily: 'serif', fontSize: 24, color: colors.ink, marginBottom: 8 }}>
        No {kind} yet
      </Text>
      <Text
        style={{
          maxWidth: 290,
          textAlign: 'center',
          fontSize: 14,
          lineHeight: 21,
          color: colors.muted,
        }}
      >
        {outfits
          ? 'Create your first outfit from a mirror selfie on the Camera page.'
          : 'Clothing pieces appear here when you save a generated outfit.'}
      </Text>
    </View>
  );
}

function CategoryEditorModalBase({
  kind,
  editor,
  onClose,
  onAdd,
  onRename,
  onDelete,
}: {
  kind: CategoryKind;
  editor: CategoryEditor | null;
  onClose: () => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (category: Category) => void;
}) {
  const [name, setName] = useState('');
  useEffect(() => {
    setName(editor?.mode === 'edit' ? editor.category.name : '');
  }, [editor]);
  const protectedId = kind === 'outfit' ? UNCATEGORIZED_OUTFIT : UNCATEGORIZED_PIECE;
  const editing = editor?.mode === 'edit' ? editor.category : null;
  function submit() {
    if (!name.trim()) return;
    if (editing) onRename(editing.id, name);
    else onAdd(name);
    onClose();
  }
  return (
    <Modal
      visible={!!editor}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      presentationStyle={Platform.OS === 'web' ? undefined : 'overFullScreen'}
      onRequestClose={onClose}
    >
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onClose}
              style={styles.sheetHeaderButton}
            >
              <Text style={styles.sheetHeaderAction}>Cancel</Text>
            </Pressable>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.sheetTitle}>
              {editing ? 'Edit category' : 'New category'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Save category' : 'Create category'}
              onPress={submit}
              style={[styles.sheetHeaderButton, styles.sheetHeaderButtonRight]}
            >
              <Text style={[styles.sheetHeaderAction, styles.sheetDone]}>
                {editing ? 'Save' : 'Add'}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetContent}
          >
            <Text style={styles.sheetSectionLabel}>{kind.toUpperCase()} CATEGORY</Text>
            <View style={styles.sheetGroup}>
              <TextInput
                autoFocus
                accessibilityLabel={
                  editing ? `Category name for ${editing.name}` : `New ${kind} category name`
                }
                value={name}
                onChangeText={setName}
                placeholder="Category name"
                placeholderTextColor="#8D877C"
                style={styles.sheetInput}
              />
            </View>
            {editing && editing.id !== protectedId && (
              <View style={styles.sheetGroup}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.sheetDeleteButton}
                  onPress={() => onDelete(editing)}
                >
                  <Text style={styles.dangerText}>Delete category</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CategoryEditorModal(props: {
  kind: CategoryKind;
  editor: CategoryEditor | null;
  onClose: () => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (category: Category) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  useEffect(() => {
    if (!props.editor) setPendingDelete(null);
  }, [props.editor]);
  return (
    <>
      <CategoryEditorModalBase {...props} onDelete={setPendingDelete} />
      <ConfirmModal
        visible={!!pendingDelete}
        title="Delete category?"
        message={`Items in ${pendingDelete?.name ?? 'this category'} will move to Uncategorized.`}
        confirmLabel="Delete category"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) props.onDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </>
  );
}

function OutfitsPage({
  library,
  setLibrary,
}: {
  library: LibraryState;
  setLibrary: (next: LibraryState) => void;
}) {
  const [selected, setSelected] = useState<SavedOutfit | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<SavedPiece | null>(null);
  const [expanded, setExpanded] = useState<string | null>(UNCATEGORIZED_OUTFIT);
  return (
    <>
      <ScrollView contentContainerStyle={styles.libraryFullscreen}>
        {!library.outfits.length && <LibraryEmptyState kind="outfits" />}
        {library.outfitCategories
          .filter((category) => library.outfits.some((item) => item.categoryId === category.id))
          .map((category) => {
            const items = library.outfits.filter((item) => item.categoryId === category.id);
            return (
              <CategoryAccordion
                key={category.id}
                category={category}
                images={items.map((item) => item.image)}
                count={items.length}
                expanded={expanded === category.id}
                onToggle={() => setExpanded(expanded === category.id ? null : category.id)}
                emptyText="No outfits in this category."
              >
                <CardGrid columns={library.settings.outfitGridColumns}>
                  {items.map((outfit) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open outfit ${outfit.description}`}
                      key={outfit.id}
                      style={styles.gridCard}
                      onPress={() => setSelected(outfit)}
                    >
                      <StoredImage uri={outfit.image} style={styles.gridImage} />
                      <Text numberOfLines={3} style={styles.gridDescription}>
                        {outfit.description}
                      </Text>
                    </Pressable>
                  ))}
                </CardGrid>
              </CategoryAccordion>
            );
          })}
      </ScrollView>
      <OutfitModal
        columns={library.settings.pieceGridColumns}
        outfit={selected}
        categories={library.outfitCategories}
        pieces={
          selected
            ? library.pieces.filter((piece) => pieceOutfitIds(piece).includes(selected.id))
            : []
        }
        onOpenPiece={(piece) => {
          setSelected(null);
          setSelectedPiece(piece);
        }}
        onClose={() => setSelected(null)}
        onEditOutfit={(changes) => {
          if (!selected) return;
          const next = { ...selected, ...changes };
          setLibrary({
            ...library,
            outfits: library.outfits.map((outfit) => (outfit.id === selected.id ? next : outfit)),
          });
          setSelected(next);
        }}
        onDelete={() => {
          if (!selected) return;
          setLibrary(removeOutfitFromLibrary(library, selected));
          setSelected(null);
        }}
      />
      <PieceModal
        columns={library.settings.outfitGridColumns}
        piece={selectedPiece}
        mergeCandidates={
          selectedPiece
            ? library.pieces.filter(
                (piece) =>
                  piece.id !== selectedPiece.id && piece.categoryId === selectedPiece.categoryId,
              )
            : []
        }
        categories={library.pieceCategories}
        onMergePiece={(target, dataSource) => {
          if (!selectedPiece) return;
          void deleteStoredImage(dataSource === 'source' ? target.image : selectedPiece.image);
          const next = mergePieces(library, target.id, selectedPiece.id, dataSource);
          setLibrary(next);
          setSelectedPiece(next.pieces.find((piece) => piece.id === target.id) ?? null);
        }}
        onEditPiece={(changes) => {
          if (!selectedPiece) return;
          const next = { ...selectedPiece, ...changes };
          setLibrary({
            ...library,
            pieces: library.pieces.map((piece) => (piece.id === selectedPiece.id ? next : piece)),
          });
          setSelectedPiece(next);
        }}
        outfits={
          selectedPiece
            ? library.outfits.filter((outfit) => pieceOutfitIds(selectedPiece).includes(outfit.id))
            : []
        }
        onOpenOutfit={(outfit) => {
          setSelectedPiece(null);
          setSelected(outfit);
        }}
        onClose={() => setSelectedPiece(null)}
        onDelete={() => {
          if (!selectedPiece) return;
          void deleteStoredImage(selectedPiece.image);
          setLibrary({
            ...library,
            pieces: library.pieces.filter((item) => item.id !== selectedPiece.id),
          });
          setSelectedPiece(null);
        }}
      />
    </>
  );
}

function LegacyOutfitModal({
  outfit,
  pieces,
  columns,
  onOpenPiece,
  onClose,
  onDelete,
}: {
  outfit: SavedOutfit | null;
  pieces: LibraryState['pieces'];
  columns: GridColumns;
  onOpenPiece: (piece: SavedPiece) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const rows = Array.from({ length: Math.ceil(pieces.length / columns) }, (_, index) =>
    pieces.slice(index * columns, index * columns + columns),
  );
  return (
    <Modal
      visible={!!outfit}
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      presentationStyle={Platform.OS === 'web' ? undefined : 'overFullScreen'}
      transparent
      onRequestClose={onClose}
    >
      {outfit && (
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close outfit"
                onPress={onClose}
                style={styles.sheetHeaderButton}
              >
                <Text style={styles.sheetHeaderAction}>Close</Text>
              </Pressable>
              <Text accessibilityRole="header" style={styles.sheetTitle}>
                Outfit details
              </Text>
              <View style={styles.sheetHeaderSpacer} />
            </View>
            <ScrollView contentContainerStyle={styles.outfitDetailContent}>
              <StoredImage uri={outfit.image} style={styles.outfitDetailImage} />
              <View style={styles.outfitDescriptionCard}>
                <Text style={styles.detailEyebrow}>AI DESCRIPTION</Text>
                <Text style={styles.outfitDescription}>{outfit.description}</Text>
              </View>
              <View style={styles.detailSectionHeader}>
                <Text style={styles.detailSectionTitle}>Pieces</Text>
                <Text style={styles.detailCount}>{pieces.length}</Text>
              </View>
              <View
                accessibilityLabel={`Pieces grid, ${columns} columns`}
                style={styles.mappedPieceGrid}
              >
                {rows.map((row, rowIndex) => (
                  <View key={row[0]?.id ?? rowIndex} style={styles.mappedPieceRow}>
                    {row.map((piece) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Open piece ${piece.label}`}
                        onPress={() => onOpenPiece(piece)}
                        key={piece.id}
                        style={styles.mappedPieceCard}
                      >
                        <StoredImage uri={piece.image} style={styles.mappedPieceImage} />
                        <View style={styles.mappedPieceBody}>
                          <Text numberOfLines={2} style={styles.mappedPieceTitle}>
                            {piece.label}
                          </Text>
                          <Text numberOfLines={4} style={styles.mappedPieceDescription}>
                            {piece.description}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                    {Array.from({ length: columns - row.length }, (_, placeholderIndex) => (
                      <View
                        key={`placeholder-${placeholderIndex}`}
                        style={styles.mappedPiecePlaceholder}
                      />
                    ))}
                  </View>
                ))}
              </View>
              <Pressable
                style={styles.dangerButton}
                onPress={() =>
                  Alert.alert('Delete outfit?', 'The outfit and all pieces will be deleted.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: onDelete },
                  ])
                }
              >
                <Text style={styles.dangerText}>Delete outfit</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      )}
    </Modal>
  );
}

function LegacyPieceModal({
  piece,
  outfits,
  mergeCandidates,
  columns,
  onOpenOutfit,
  onMergePiece,
  onClose,
  onDelete,
}: {
  piece: SavedPiece | null;
  outfits: SavedOutfit[];
  mergeCandidates: SavedPiece[];
  columns: GridColumns;
  onOpenOutfit: (outfit: SavedOutfit) => void;
  onMergePiece: (target: SavedPiece) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const rows = Array.from({ length: Math.ceil(outfits.length / columns) }, (_, index) =>
    outfits.slice(index * columns, index * columns + columns),
  );
  const mergeRows = Array.from({ length: Math.ceil(mergeCandidates.length / 2) }, (_, index) =>
    mergeCandidates.slice(index * 2, index * 2 + 2),
  );
  return (
    <Modal
      visible={!!piece}
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      presentationStyle={Platform.OS === 'web' ? undefined : 'overFullScreen'}
      transparent
      onRequestClose={onClose}
    >
      {piece && (
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close piece"
                onPress={onClose}
                style={styles.sheetHeaderButton}
              >
                <Text style={styles.sheetHeaderAction}>Close</Text>
              </Pressable>
              <Text accessibilityRole="header" style={styles.sheetTitle}>
                Piece details
              </Text>
              <View style={styles.sheetHeaderSpacer} />
            </View>
            <ScrollView contentContainerStyle={styles.outfitDetailContent}>
              <StoredImage uri={piece.image} style={styles.outfitDetailImage} />
              <View style={styles.outfitDescriptionCard}>
                <Text style={styles.detailEyebrow}>AI DESCRIPTION</Text>
                <Text style={styles.detailItemTitle}>{piece.label}</Text>
                <Text style={styles.outfitDescription}>{piece.description}</Text>
              </View>
              {!!mergeCandidates.length && (
                <>
                  <View style={styles.detailSectionHeader}>
                    <Text style={styles.detailSectionTitle}>Merge piece</Text>
                    <Text style={styles.detailCount}>{mergeCandidates.length}</Text>
                  </View>
                  <View style={styles.mappedPieceGrid}>
                    {mergeRows.map((row, rowIndex) => (
                      <View key={row[0]?.id ?? rowIndex} style={styles.mappedPieceRow}>
                        {row.map((candidate) => (
                          <View key={candidate.id} style={styles.mappedPieceCard}>
                            <StoredImage uri={candidate.image} style={styles.mappedPieceImage} />
                            <View style={styles.mappedPieceBody}>
                              <Text numberOfLines={2} style={styles.mappedPieceTitle}>
                                {candidate.label}
                              </Text>
                              <Text numberOfLines={3} style={styles.mappedPieceDescription}>
                                {candidate.description}
                              </Text>
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Merge ${piece.label} into ${candidate.label}`}
                              onPress={() => onMergePiece(candidate)}
                              style={styles.mergeConfirmButton}
                            >
                              <Text style={styles.mergeConfirmText}>Merge</Text>
                            </Pressable>
                          </View>
                        ))}
                        {row.length === 1 && <View style={styles.mappedPiecePlaceholder} />}
                      </View>
                    ))}
                  </View>
                </>
              )}
              <View style={styles.detailSectionHeader}>
                <Text style={styles.detailSectionTitle}>Outfits</Text>
                <Text style={styles.detailCount}>{outfits.length}</Text>
              </View>
              <View
                accessibilityLabel={`Outfits grid, ${columns} columns`}
                style={styles.mappedPieceGrid}
              >
                {rows.map((row, rowIndex) => (
                  <View key={row[0]?.id ?? rowIndex} style={styles.mappedPieceRow}>
                    {row.map((outfit) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Open outfit ${outfit.description}`}
                        onPress={() => onOpenOutfit(outfit)}
                        key={outfit.id}
                        style={styles.mappedPieceCard}
                      >
                        <StoredImage uri={outfit.image} style={styles.mappedPieceImage} />
                        <View style={styles.mappedPieceBody}>
                          <Text numberOfLines={4} style={styles.mappedPieceDescription}>
                            {outfit.description}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                    {Array.from({ length: columns - row.length }, (_, placeholderIndex) => (
                      <View
                        key={`placeholder-${placeholderIndex}`}
                        style={styles.mappedPiecePlaceholder}
                      />
                    ))}
                  </View>
                ))}
              </View>
              <Pressable
                style={styles.dangerButton}
                onPress={() =>
                  Alert.alert('Delete piece?', 'This piece will be removed from your wardrobe.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: onDelete },
                  ])
                }
              >
                <Text style={styles.dangerText}>Delete piece</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      )}
    </Modal>
  );
}

function PiecesPage({
  library,
  setLibrary,
}: {
  library: LibraryState;
  setLibrary: (next: LibraryState) => void;
}) {
  const [selected, setSelected] = useState<SavedPiece | null>(null);
  const [selectedOutfit, setSelectedOutfit] = useState<SavedOutfit | null>(null);
  const [expanded, setExpanded] = useState<string | null>(UNCATEGORIZED_PIECE);
  return (
    <>
      <ScrollView contentContainerStyle={styles.libraryFullscreen}>
        {!library.pieces.length && <LibraryEmptyState kind="pieces" />}
        {library.pieceCategories
          .filter((category) => library.pieces.some((item) => item.categoryId === category.id))
          .map((category) => {
            const items = library.pieces.filter((item) => item.categoryId === category.id);
            return (
              <CategoryAccordion
                key={category.id}
                category={category}
                images={items.map((item) => item.image)}
                count={items.length}
                expanded={expanded === category.id}
                onToggle={() => setExpanded(expanded === category.id ? null : category.id)}
                emptyText="No pieces in this category."
              >
                <CardGrid columns={library.settings.pieceGridColumns}>
                  {items.map((piece) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open piece ${piece.label}`}
                      onPress={() => setSelected(piece)}
                      key={piece.id}
                      style={styles.gridCard}
                    >
                      <StoredImage uri={piece.image} style={styles.gridImage} />
                      <View style={styles.gridBody}>
                        <Text style={styles.cardTitle}>{piece.label}</Text>
                        <Text style={styles.gridDescription}>{piece.description}</Text>
                      </View>
                    </Pressable>
                  ))}
                </CardGrid>
              </CategoryAccordion>
            );
          })}
      </ScrollView>
      <PieceModal
        columns={library.settings.outfitGridColumns}
        piece={selected}
        mergeCandidates={
          selected
            ? library.pieces.filter(
                (piece) => piece.id !== selected.id && piece.categoryId === selected.categoryId,
              )
            : []
        }
        categories={library.pieceCategories}
        onMergePiece={(target, dataSource) => {
          if (!selected) return;
          void deleteStoredImage(dataSource === 'source' ? target.image : selected.image);
          const next = mergePieces(library, target.id, selected.id, dataSource);
          setLibrary(next);
          setSelected(next.pieces.find((piece) => piece.id === target.id) ?? null);
        }}
        onEditPiece={(changes) => {
          if (!selected) return;
          const next = { ...selected, ...changes };
          setLibrary({
            ...library,
            pieces: library.pieces.map((piece) => (piece.id === selected.id ? next : piece)),
          });
          setSelected(next);
        }}
        outfits={
          selected
            ? library.outfits.filter((outfit) => pieceOutfitIds(selected).includes(outfit.id))
            : []
        }
        onOpenOutfit={(outfit) => {
          setSelected(null);
          setSelectedOutfit(outfit);
        }}
        onClose={() => setSelected(null)}
        onDelete={() => {
          if (!selected) return;
          void deleteStoredImage(selected.image);
          setLibrary({
            ...library,
            pieces: library.pieces.filter((item) => item.id !== selected.id),
          });
          setSelected(null);
        }}
      />
      <OutfitModal
        columns={library.settings.pieceGridColumns}
        outfit={selectedOutfit}
        categories={library.outfitCategories}
        pieces={
          selectedOutfit
            ? library.pieces.filter((piece) => pieceOutfitIds(piece).includes(selectedOutfit.id))
            : []
        }
        onOpenPiece={(piece) => {
          setSelectedOutfit(null);
          setSelected(piece);
        }}
        onClose={() => setSelectedOutfit(null)}
        onEditOutfit={(changes) => {
          if (!selectedOutfit) return;
          const next = { ...selectedOutfit, ...changes };
          setLibrary({
            ...library,
            outfits: library.outfits.map((outfit) =>
              outfit.id === selectedOutfit.id ? next : outfit,
            ),
          });
          setSelectedOutfit(next);
        }}
        onDelete={() => {
          if (!selectedOutfit) return;
          setLibrary(removeOutfitFromLibrary(library, selectedOutfit));
          setSelectedOutfit(null);
        }}
      />
    </>
  );
}

function GridSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: GridColumns;
  onChange: (value: GridColumns) => void;
}) {
  return (
    <View style={styles.settingsGroup}>
      <Text style={styles.settingsRowTitle}>{label}</Text>
      <View style={styles.segmentedControl}>
        {([2, 3, 4] as GridColumns[]).map((columns) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Use ${columns} columns for ${label.toLowerCase()}${value === columns ? ', selected' : ''}`}
            key={columns}
            onPress={() => onChange(columns)}
            style={[styles.segment, value === columns && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, value === columns && styles.segmentTextActive]}>
              {columns}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ThemeSelector({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  const options: { value: ThemePreference; label: string; icon: IconName }[] = [
    { value: 'light', label: 'Light', icon: 'sunny-outline' },
    { value: 'dark', label: 'Dark', icon: 'moon-outline' },
    { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  ];
  return (
    <View style={styles.settingsGroup}>
      <View style={styles.segmentedControl}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${option.label} appearance${selected ? ', selected' : ''}`}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.segment, selected && styles.segmentActive]}
            >
              <Ionicons
                name={option.icon}
                size={18}
                color={selected ? colors.card : colors.muted}
              />
              <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SettingsPage({
  library,
  setLibrary,
  session,
  onLogout,
}: {
  library: LibraryState;
  setLibrary: (next: LibraryState) => void;
  session: AuthSession;
  onLogout: () => void;
}) {
  const [categoryEditor, setCategoryEditor] = useState<{
    kind: CategoryKind;
    editor: CategoryEditor;
  } | null>(null);
  const categories = (kind: CategoryKind) =>
    kind === 'outfit' ? library.outfitCategories : library.pieceCategories;
  function requestDelete(kind: CategoryKind, category: Category) {
    setLibrary(deleteCategory(library, kind, category.id));
    setCategoryEditor(null);
  }
  return (
    <>
      <ScrollView contentContainerStyle={[styles.page, styles.settingsPage]}>
        <Text style={styles.settingsSectionTitle}>Account</Text>
        <View style={styles.settingsCategoryGroup}>
          <View style={styles.accountRow}>
            <View style={styles.accountCopy}>
              <Text style={styles.settingsCategoryName}>{session.user.username}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onLogout} style={styles.logoutButton}>
              <Text style={styles.logoutText}>Log out</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.settingsSectionTitle}>Appearance</Text>
        <ThemeSelector
          value={library.settings.theme}
          onChange={(theme) => setLibrary({ ...library, settings: { ...library.settings, theme } })}
        />
        <Text style={styles.settingsSectionTitle}>Grid size</Text>
        <GridSelector
          label="Outfits"
          value={library.settings.outfitGridColumns}
          onChange={(outfitGridColumns) =>
            setLibrary({ ...library, settings: { ...library.settings, outfitGridColumns } })
          }
        />
        <GridSelector
          label="Pieces"
          value={library.settings.pieceGridColumns}
          onChange={(pieceGridColumns) =>
            setLibrary({ ...library, settings: { ...library.settings, pieceGridColumns } })
          }
        />
        {(['outfit', 'piece'] as CategoryKind[]).map((kind) => (
          <View key={kind}>
            <Text style={styles.settingsSectionTitle}>
              {kind === 'outfit' ? 'Outfit categories' : 'Piece categories'}
            </Text>
            <View style={styles.settingsCategoryGroup}>
              {categories(kind).map((category, index) => (
                <View
                  key={category.id}
                  style={[styles.settingsCategoryRow, index > 0 && styles.settingsCategoryBorder]}
                >
                  <Text style={styles.settingsCategoryName}>{category.name}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${category.name}`}
                    onPress={() => setCategoryEditor({ kind, editor: { mode: 'edit', category } })}
                    style={styles.settingsEditButton}
                  >
                    <Text style={styles.sheetHeaderAction}>Edit</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              style={styles.settingsAddButton}
              onPress={() => setCategoryEditor({ kind, editor: { mode: 'add' } })}
            >
              <Text style={styles.addCategoryText}>＋ Add {kind} category</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
      {categoryEditor && (
        <CategoryEditorModal
          kind={categoryEditor.kind}
          editor={categoryEditor.editor}
          onClose={() => setCategoryEditor(null)}
          onAdd={(name) => setLibrary(addCategory(library, categoryEditor.kind, name))}
          onRename={(id, name) =>
            setLibrary(renameCategory(library, categoryEditor.kind, id, name))
          }
          onDelete={(category) => requestDelete(categoryEditor.kind, category)}
        />
      )}
    </>
  );
}

function AuthPage({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'register') {
        setNotice(await register(username, password));
        setMode('login');
      } else {
        const session = await login(username, password);
        await saveSession(session);
        onAuthenticated(session);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.authPage}>
      <StatusBar style="dark" />
      <View style={styles.authBackdropBrand}>
        <Image
          source={require('./assets/fashion-canvas-mark.png')}
          style={styles.authBackdropLogo}
        />
        <Text style={styles.authBackdropTitle}>Fashion Canvas</Text>
      </View>
      <Modal visible transparent animationType="slide" onRequestClose={() => undefined}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderSpacer} />
              <Text style={styles.sheetTitle}>{mode === 'login' ? 'Log in' : 'Register'}</Text>
              <View style={styles.sheetHeaderSpacer} />
            </View>
            <ScrollView
              contentContainerStyle={styles.authContent}
              keyboardShouldPersistTaps="handled"
            >
              <Image source={require('./assets/fashion-canvas-mark.png')} style={styles.authLogo} />
              <Text accessibilityRole="header" style={styles.authTitle}>
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </Text>
              <Text style={styles.authIntro}>
                {mode === 'login'
                  ? 'Log in to Fashion Canvas before creating outfits from your photos.'
                  : 'Register to keep image uploads protected by your account.'}
              </Text>
              <View style={styles.authForm}>
                <Text style={styles.authLabel}>Username</Text>
                <TextInput
                  accessibilityLabel="Username"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!busy}
                  onChangeText={setUsername}
                  returnKeyType="next"
                  style={styles.authInput}
                  value={username}
                />
                <Text style={styles.authLabel}>Password</Text>
                <TextInput
                  accessibilityLabel="Password"
                  editable={!busy}
                  onChangeText={setPassword}
                  onSubmitEditing={submit}
                  returnKeyType="done"
                  secureTextEntry
                  style={styles.authInput}
                  value={password}
                />
                {!!error && (
                  <Text accessibilityRole="alert" style={styles.authError}>
                    {error}
                  </Text>
                )}
                {!!notice && (
                  <Text accessibilityLiveRegion="polite" style={styles.authNotice}>
                    {notice}
                  </Text>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={submit}
                  style={[styles.authSubmit, busy && styles.authDisabled]}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {mode === 'login' ? 'Log in' : 'Register'}
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setError('');
                    setNotice('');
                  }}
                  style={styles.authSwitch}
                >
                  <Text style={styles.authSwitchText}>
                    {mode === 'login' ? 'New here? Register' : 'Already registered? Log in'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AppContent() {
  const [tab, setTab] = useState<Tab>('photo');
  const [library, setLibrary] = useState(initialLibrary());
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const systemScheme = useColorScheme();
  const resolvedTheme =
    library.settings.theme === 'system' ? (systemScheme ?? 'light') : library.settings.theme;
  colors = resolvedTheme === 'dark' ? darkColors : lightColors;
  styles = withAlignedCardText(createStyles(colors));
  useEffect(() => {
    Promise.all([loadLibrary(), loadSession()]).then(async ([stored, storedSession]) => {
      try {
        setLibrary(await migrateLibraryImages(stored));
      } catch {
        setLibrary(stored);
      } finally {
        setSession(storedSession);
        setHydrated(true);
      }
    });
  }, []);
  useEffect(() => {
    if (hydrated) saveLibrary(library);
  }, [library, hydrated]);
  const page = useMemo(
    () =>
      tab === 'photo' ? (
        <PhotoPage
          library={library}
          setLibrary={setLibrary}
          onSaved={() => setTab('outfits')}
          authToken={session?.token ?? ''}
        />
      ) : tab === 'outfits' ? (
        <OutfitsPage library={library} setLibrary={setLibrary} />
      ) : tab === 'pieces' ? (
        <PiecesPage library={library} setLibrary={setLibrary} />
      ) : (
        <SettingsPage
          library={library}
          setLibrary={setLibrary}
          session={session!}
          onLogout={() => {
            void clearSession();
            setSession(null);
            setTab('photo');
          }}
        />
      ),
    [tab, library, resolvedTheme, session],
  );
  if (!hydrated)
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color="#B84F32" />
      </SafeAreaView>
    );
  if (!session) return <AuthPage onAuthenticated={setSession} />;
  return (
    <SafeAreaView edges={['top']} style={styles.app}>
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.brandBar}>
        <Image
          accessibilityLabel="Fashion Canvas logo"
          source={require('./assets/fashion-canvas-mark.png')}
          style={styles.brandMark}
        />
        <Text style={styles.brand}>Fashion Canvas</Text>
      </View>
      <View style={styles.content}>{page}</View>
      <SafeAreaView edges={['bottom']} style={styles.tabSafeArea}>
        <View style={styles.tabs}>
          {tabs.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: active }}
                key={item.key}
                onPress={() => setTab(item.key)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Ionicons
                  name={active ? item.activeIcon : item.icon}
                  size={21}
                  color={active ? colors.rust : colors.muted}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function OutfitModal({
  outfit,
  pieces,
  categories,
  columns,
  onOpenPiece,
  onEditOutfit,
  onClose,
  onDelete,
}: {
  outfit: SavedOutfit | null;
  pieces: LibraryState['pieces'];
  categories: Category[];
  columns: GridColumns;
  onOpenPiece: (piece: SavedPiece) => void;
  onEditOutfit: (changes: OutfitChanges) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [action, setAction] = useState<'edit' | 'delete' | null>(null);
  useEffect(() => {
    if (!outfit) setAction(null);
  }, [outfit]);
  const rows = Array.from({ length: Math.ceil(pieces.length / columns) }, (_, index) =>
    pieces.slice(index * columns, index * columns + columns),
  );
  return (
    <>
      <Modal
        visible={!!outfit && action === null}
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        presentationStyle={Platform.OS === 'web' ? undefined : 'overFullScreen'}
        transparent
        onRequestClose={onClose}
      >
        {outfit && (
          <View style={styles.sheetBackdrop}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close outfit"
                  onPress={onClose}
                  style={styles.sheetHeaderButton}
                >
                  <Text style={styles.sheetHeaderAction}>Close</Text>
                </Pressable>
                <Text accessibilityRole="header" style={styles.sheetTitle}>
                  Outfit details
                </Text>
                <View style={styles.sheetHeaderSpacer} />
              </View>
              <ScrollView contentContainerStyle={styles.outfitDetailContent}>
                <StoredImage uri={outfit.image} style={styles.outfitDetailImage} />
                <View style={styles.outfitDescriptionCard}>
                  <Text style={styles.detailEyebrow}>DESCRIPTION</Text>
                  <Text style={styles.outfitDescription}>{outfit.description}</Text>
                </View>
                <View style={styles.pieceActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit outfit"
                    onPress={() => setAction('edit')}
                    style={styles.pieceAction}
                  >
                    <Ionicons name="create-outline" size={20} color={colors.ink} />
                    <Text style={styles.pieceActionText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Delete outfit"
                    onPress={() => setAction('delete')}
                    style={styles.pieceAction}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.rust} />
                    <Text style={styles.pieceDeleteActionText}>Delete</Text>
                  </Pressable>
                </View>
                <View style={styles.detailSectionHeader}>
                  <Text style={styles.detailSectionTitle}>Pieces</Text>
                  <Text style={styles.detailCount}>{pieces.length}</Text>
                </View>
                <View
                  accessibilityLabel={`Pieces grid, ${columns} columns`}
                  style={styles.mappedPieceGrid}
                >
                  {rows.map((row, rowIndex) => (
                    <View key={row[0]?.id ?? rowIndex} style={styles.mappedPieceRow}>
                      {row.map((piece) => (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Open piece ${piece.label}`}
                          onPress={() => onOpenPiece(piece)}
                          key={piece.id}
                          style={styles.mappedPieceCard}
                        >
                          <StoredImage uri={piece.image} style={styles.mappedPieceImage} />
                          <View style={styles.mappedPieceBody}>
                            <Text numberOfLines={2} style={styles.mappedPieceTitle}>
                              {piece.label}
                            </Text>
                            <Text numberOfLines={4} style={styles.mappedPieceDescription}>
                              {piece.description}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                      {Array.from({ length: columns - row.length }, (_, placeholderIndex) => (
                        <View
                          key={`placeholder-${placeholderIndex}`}
                          style={styles.mappedPiecePlaceholder}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
      <OutfitEditModal
        outfit={action === 'edit' ? outfit : null}
        categories={categories}
        onCancel={() => setAction(null)}
        onSave={(changes) => {
          onEditOutfit(changes);
          setAction(null);
        }}
      />
      <ConfirmModal
        visible={action === 'delete'}
        title="Delete outfit?"
        message="This outfit will be permanently removed. Pieces used only by this outfit will also be deleted."
        confirmLabel="Delete outfit"
        onCancel={() => setAction(null)}
        onConfirm={() => {
          setAction(null);
          onDelete();
        }}
      />
    </>
  );
}

type OutfitChanges = Pick<SavedOutfit, 'description' | 'categoryId'>;
type PieceChanges = Pick<SavedPiece, 'label' | 'description' | 'categoryId'>;

function OutfitEditModal({
  outfit,
  categories,
  onCancel,
  onSave,
}: {
  outfit: SavedOutfit | null;
  categories: Category[];
  onCancel: () => void;
  onSave: (changes: OutfitChanges) => void;
}) {
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(UNCATEGORIZED_OUTFIT);
  useEffect(() => {
    if (outfit) {
      setDescription(outfit.description);
      setCategoryId(outfit.categoryId);
    }
  }, [outfit]);
  return (
    <Modal
      visible={!!outfit}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      onRequestClose={onCancel}
    >
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel edit"
              onPress={onCancel}
              style={styles.sheetHeaderButton}
            >
              <Text style={styles.sheetHeaderAction}>Cancel</Text>
            </Pressable>
            <Text accessibilityRole="header" style={styles.sheetTitle}>
              Edit outfit
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save outfit"
              disabled={!description.trim()}
              onPress={() => onSave({ description: description.trim(), categoryId })}
              style={[styles.sheetHeaderButton, styles.sheetHeaderButtonRight]}
            >
              <Text style={[styles.sheetHeaderAction, styles.sheetDone]}>Save</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetContent}
          >
            <Text style={styles.sheetSectionLabel}>DESCRIPTION</Text>
            <View style={styles.sheetGroup}>
              <TextInput
                accessibilityLabel="Outfit description"
                multiline
                value={description}
                onChangeText={setDescription}
                style={[styles.sheetInput, styles.descriptionInput]}
              />
            </View>
            <Text style={styles.sheetSectionLabel}>CATEGORY</Text>
            <View style={styles.editCategoryList}>
              {categories.map((category) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: categoryId === category.id }}
                  accessibilityLabel={`Use category ${category.name}`}
                  key={category.id}
                  onPress={() => setCategoryId(category.id)}
                  style={styles.choiceRow}
                >
                  <Ionicons
                    name={categoryId === category.id ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={categoryId === category.id ? colors.rust : colors.muted}
                  />
                  <Text style={styles.choiceText}>{category.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmBackdrop}>
        <View accessibilityRole="alert" style={styles.confirmCard}>
          <Text accessibilityRole="header" style={styles.confirmTitle}>
            {title}
          </Text>
          <Text style={styles.confirmMessage}>{message}</Text>
          <View style={styles.confirmActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onCancel}
              style={styles.confirmCancel}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              onPress={onConfirm}
              style={styles.confirmDelete}
            >
              <Text style={styles.primaryButtonText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PieceEditModal({
  piece,
  categories,
  onCancel,
  onSave,
}: {
  piece: SavedPiece | null;
  categories: Category[];
  onCancel: () => void;
  onSave: (changes: PieceChanges) => void;
}) {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(UNCATEGORIZED_PIECE);
  useEffect(() => {
    if (piece) {
      setLabel(piece.label);
      setDescription(piece.description);
      setCategoryId(piece.categoryId);
    }
  }, [piece]);
  return (
    <Modal
      visible={!!piece}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      onRequestClose={onCancel}
    >
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel edit"
              onPress={onCancel}
              style={styles.sheetHeaderButton}
            >
              <Text style={styles.sheetHeaderAction}>Cancel</Text>
            </Pressable>
            <Text accessibilityRole="header" style={styles.sheetTitle}>
              Edit piece
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save piece"
              disabled={!label.trim() || !description.trim()}
              onPress={() =>
                onSave({ label: label.trim(), description: description.trim(), categoryId })
              }
              style={[styles.sheetHeaderButton, styles.sheetHeaderButtonRight]}
            >
              <Text style={[styles.sheetHeaderAction, styles.sheetDone]}>Save</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetContent}
          >
            <Text style={styles.sheetSectionLabel}>TITLE</Text>
            <View style={styles.sheetGroup}>
              <TextInput
                accessibilityLabel="Piece title"
                value={label}
                onChangeText={setLabel}
                style={styles.sheetInput}
              />
            </View>
            <Text style={styles.sheetSectionLabel}>DESCRIPTION</Text>
            <View style={styles.sheetGroup}>
              <TextInput
                accessibilityLabel="Piece description"
                multiline
                value={description}
                onChangeText={setDescription}
                style={[styles.sheetInput, styles.descriptionInput]}
              />
            </View>
            <Text style={styles.sheetSectionLabel}>CATEGORY</Text>
            <View style={styles.editCategoryList}>
              {categories.map((category) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: categoryId === category.id }}
                  accessibilityLabel={`Use category ${category.name}`}
                  key={category.id}
                  onPress={() => setCategoryId(category.id)}
                  style={styles.choiceRow}
                >
                  <Ionicons
                    name={categoryId === category.id ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={categoryId === category.id ? colors.rust : colors.muted}
                  />
                  <Text style={styles.choiceText}>{category.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PieceMergeModal({
  piece,
  candidates,
  onCancel,
  onMerge,
}: {
  piece: SavedPiece | null;
  candidates: SavedPiece[];
  onCancel: () => void;
  onMerge: (target: SavedPiece, dataSource: 'target' | 'source') => void;
}) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [useCurrentData, setUseCurrentData] = useState(true);
  useEffect(() => {
    setTargetId(null);
    setUseCurrentData(true);
  }, [piece]);
  const target = candidates.find((candidate) => candidate.id === targetId);
  return (
    <Modal
      visible={!!piece}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      onRequestClose={onCancel}
    >
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel merge"
              onPress={onCancel}
              style={styles.sheetHeaderButton}
            >
              <Text style={styles.sheetHeaderAction}>Cancel</Text>
            </Pressable>
            <Text accessibilityRole="header" style={styles.sheetTitle}>
              Merge piece
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm merge"
              disabled={!target}
              onPress={() => target && onMerge(target, useCurrentData ? 'source' : 'target')}
              style={[styles.sheetHeaderButton, styles.sheetHeaderButtonRight]}
            >
              <Text
                style={[styles.sheetHeaderAction, styles.sheetDone, !target && styles.disabledText]}
              >
                Merge
              </Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <Text style={styles.sheetSectionLabel}>MERGE WITH</Text>
            <View style={styles.editCategoryList}>
              {candidates.map((candidate) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: targetId === candidate.id }}
                  accessibilityLabel={`Select ${candidate.label}`}
                  key={candidate.id}
                  onPress={() => setTargetId(candidate.id)}
                  style={styles.choiceRow}
                >
                  <StoredImage uri={candidate.image} style={styles.choiceImage} />
                  <View style={styles.choiceCopy}>
                    <Text style={styles.choiceText}>{candidate.label}</Text>
                    <Text numberOfLines={2} style={styles.choiceDescription}>
                      {candidate.description}
                    </Text>
                  </View>
                  <Ionicons
                    name={targetId === candidate.id ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={targetId === candidate.id ? colors.rust : colors.muted}
                  />
                </Pressable>
              ))}
            </View>
            {!candidates.length && (
              <Text style={styles.emptyCategory}>There are no other pieces to merge with.</Text>
            )}{' '}
            {!!target && (
              <>
                <Text style={styles.sheetSectionLabel}>DATA TO KEEP</Text>
                <View style={styles.editCategoryList}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: useCurrentData }}
                    accessibilityLabel="Keep data from current piece"
                    onPress={() => setUseCurrentData(true)}
                    style={styles.choiceRow}
                  >
                    <Ionicons
                      name={useCurrentData ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={useCurrentData ? colors.rust : colors.muted}
                    />
                    <Text style={styles.choiceText}>Current piece · {piece?.label}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: !useCurrentData }}
                    accessibilityLabel="Keep data from other piece"
                    onPress={() => setUseCurrentData(false)}
                    style={styles.choiceRow}
                  >
                    <Ionicons
                      name={!useCurrentData ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={!useCurrentData ? colors.rust : colors.muted}
                    />
                    <Text style={styles.choiceText}>Other piece · {target.label}</Text>
                  </Pressable>
                </View>
                <Text style={styles.mergeHint}>
                  The selected piece supplies the image, title, description, and category. Outfit
                  links from both pieces are preserved.
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PieceModal({
  piece,
  outfits,
  mergeCandidates: rawMergeCandidates,
  categories,
  columns,
  onOpenOutfit,
  onMergePiece,
  onEditPiece,
  onClose,
  onDelete,
}: {
  piece: SavedPiece | null;
  outfits: SavedOutfit[];
  mergeCandidates: SavedPiece[];
  categories: Category[];
  columns: GridColumns;
  onOpenOutfit: (outfit: SavedOutfit) => void;
  onMergePiece: (target: SavedPiece, dataSource: 'target' | 'source') => void;
  onEditPiece: (changes: PieceChanges) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [action, setAction] = useState<'edit' | 'merge' | 'delete' | null>(null);
  const mergeCandidates = piece
    ? rawMergeCandidates.filter(
        (candidate) => candidate.id !== piece.id && candidate.categoryId === piece.categoryId,
      )
    : [];
  useEffect(() => {
    if (!piece) setAction(null);
  }, [piece]);
  const rows = Array.from({ length: Math.ceil(outfits.length / columns) }, (_, index) =>
    outfits.slice(index * columns, index * columns + columns),
  );
  return (
    <>
      <Modal
        // iOS cannot reliably present a second React Native Modal while this
        // details modal is still presented. Hide it before showing an action
        // sheet or confirmation modal.
        visible={!!piece && action === null}
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        presentationStyle={Platform.OS === 'web' ? undefined : 'overFullScreen'}
        transparent
        onRequestClose={onClose}
      >
        {piece && (
          <View style={styles.sheetBackdrop}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close piece"
                  onPress={onClose}
                  style={styles.sheetHeaderButton}
                >
                  <Text style={styles.sheetHeaderAction}>Close</Text>
                </Pressable>
                <Text accessibilityRole="header" style={styles.sheetTitle}>
                  Piece details
                </Text>
                <View style={styles.sheetHeaderSpacer} />
              </View>
              <ScrollView contentContainerStyle={styles.outfitDetailContent}>
                <StoredImage uri={piece.image} style={styles.outfitDetailImage} />
                <View style={styles.outfitDescriptionCard}>
                  <Text style={styles.detailEyebrow}>DESCRIPTION</Text>
                  <Text style={styles.detailItemTitle}>{piece.label}</Text>
                  <Text style={styles.outfitDescription}>{piece.description}</Text>
                </View>
                <View style={styles.pieceActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit piece"
                    onPress={() => setAction('edit')}
                    style={styles.pieceAction}
                  >
                    <Ionicons name="create-outline" size={20} color={colors.ink} />
                    <Text style={styles.pieceActionText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Merge piece"
                    accessibilityState={{ disabled: !mergeCandidates.length }}
                    disabled={!mergeCandidates.length}
                    onPress={() => setAction('merge')}
                    style={[
                      styles.pieceAction,
                      !mergeCandidates.length && styles.pieceActionDisabled,
                    ]}
                  >
                    <Ionicons name="git-merge-outline" size={20} color={colors.ink} />
                    <Text style={styles.pieceActionText}>Merge</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Delete piece"
                    onPress={() => setAction('delete')}
                    style={styles.pieceAction}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.rust} />
                    <Text style={styles.pieceDeleteActionText}>Delete</Text>
                  </Pressable>
                </View>
                <View style={styles.detailSectionHeader}>
                  <Text style={styles.detailSectionTitle}>Outfits</Text>
                  <Text style={styles.detailCount}>{outfits.length}</Text>
                </View>
                <View
                  accessibilityLabel={`Outfits grid, ${columns} columns`}
                  style={styles.mappedPieceGrid}
                >
                  {rows.map((row, rowIndex) => (
                    <View key={row[0]?.id ?? rowIndex} style={styles.mappedPieceRow}>
                      {row.map((outfit) => (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Open outfit ${outfit.description}`}
                          onPress={() => onOpenOutfit(outfit)}
                          key={outfit.id}
                          style={styles.mappedPieceCard}
                        >
                          <StoredImage uri={outfit.image} style={styles.mappedPieceImage} />
                          <View style={styles.mappedPieceBody}>
                            <Text numberOfLines={4} style={styles.mappedPieceDescription}>
                              {outfit.description}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                      {Array.from({ length: columns - row.length }, (_, placeholderIndex) => (
                        <View
                          key={`placeholder-${placeholderIndex}`}
                          style={styles.mappedPiecePlaceholder}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
      <PieceEditModal
        piece={action === 'edit' ? piece : null}
        categories={categories}
        onCancel={() => setAction(null)}
        onSave={(changes) => {
          onEditPiece(changes);
          setAction(null);
        }}
      />
      <PieceMergeModal
        piece={action === 'merge' ? piece : null}
        candidates={mergeCandidates}
        onCancel={() => setAction(null)}
        onMerge={(target, source) => {
          onMergePiece(target, source);
          setAction(null);
        }}
      />
      <ConfirmModal
        visible={action === 'delete'}
        title="Delete piece?"
        message="This piece will be permanently removed from your wardrobe."
        confirmLabel="Delete piece"
        onCancel={() => setAction(null)}
        onConfirm={() => {
          setAction(null);
          onDelete();
        }}
      />
    </>
  );
}

const lightColors = {
  ink: '#171714',
  paper: '#F3EFE6',
  card: '#FFFDF8',
  rust: '#B84F32',
  muted: '#716B61',
  line: '#D8D1C4',
  sage: '#65705D',
  imageBackground: '#E8E1D5',
  input: '#FFFFFF',
};
const darkColors: typeof lightColors = {
  ink: '#F5F1E8',
  paper: '#121211',
  card: '#1C1C19',
  rust: '#E27352',
  muted: '#AAA49A',
  line: '#38362F',
  sage: '#A8B39E',
  imageBackground: '#292824',
  input: '#24231F',
};
let colors = lightColors;
function createStyles(themeColors: typeof lightColors) {
  colors = themeColors;
  return StyleSheet.create({
    app: { flex: 1, backgroundColor: colors.paper },
    authPage: { flex: 1, backgroundColor: '#111' },
    authBackdropBrand: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 70,
    },
    authBackdropLogo: { width: 70, height: 70, borderRadius: 17, marginBottom: 14 },
    authBackdropTitle: { fontFamily: 'serif', fontSize: 24, color: '#F3EFE6' },
    authContent: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingHorizontal: 24,
      paddingTop: 34,
      paddingBottom: 48,
    },
    authLogo: { width: 82, height: 82, borderRadius: 20, marginBottom: 24 },
    authTitle: { fontFamily: 'serif', fontSize: 36, color: colors.ink, textAlign: 'center' },
    authIntro: {
      maxWidth: 420,
      marginTop: 10,
      color: colors.muted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
    authForm: { width: '100%', maxWidth: 420, marginTop: 32 },
    authLabel: { color: colors.ink, fontSize: 13, fontWeight: '700', marginBottom: 7 },
    authInput: {
      minHeight: 52,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      backgroundColor: colors.input,
      color: colors.ink,
      fontSize: 16,
      paddingHorizontal: 15,
      marginBottom: 18,
    },
    authError: { color: colors.rust, fontSize: 13, lineHeight: 19, marginBottom: 14 },
    authNotice: { color: colors.sage, fontSize: 13, lineHeight: 19, marginBottom: 14 },
    authSubmit: {
      minHeight: 52,
      borderRadius: 12,
      backgroundColor: colors.rust,
      alignItems: 'center',
      justifyContent: 'center',
    },
    authDisabled: { opacity: 0.6 },
    authSwitch: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    authSwitchText: { color: colors.rust, fontSize: 14, fontWeight: '700' },
    cameraWorkspace: { flex: 1, backgroundColor: '#111' },
    cameraLanding: { flex: 1, backgroundColor: '#111' },
    cameraEmptyStage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    cameraLandingLogo: { width: 104, height: 104, borderRadius: 24, marginBottom: 22 },
    cameraLandingTitle: {
      fontFamily: 'serif',
      fontSize: 30,
      lineHeight: 36,
      color: '#F3EFE6',
      textAlign: 'center',
    },
    cameraLandingCopy: {
      fontSize: 14,
      lineHeight: 21,
      color: '#BEB8AE',
      textAlign: 'center',
      marginTop: 8,
      maxWidth: 290,
    },
    cropStage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    cropImageFrame: { position: 'relative', overflow: 'hidden' },
    cropImage: { width: '100%', height: '100%' },
    cropShade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,.58)' },
    cropOutline: {
      position: 'absolute',
      borderWidth: 3,
      borderColor: 'white',
      shadowColor: '#000',
      shadowOpacity: 0.65,
      shadowRadius: 5,
    },
    cropHandle: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    cropGripVertical: {
      width: 11,
      height: 64,
      borderRadius: 7,
      backgroundColor: colors.rust,
      borderWidth: 2,
      borderColor: 'white',
      shadowColor: '#000',
      shadowOpacity: 0.8,
      shadowRadius: 7,
      elevation: 8,
    },
    cropGripHorizontal: {
      width: 64,
      height: 11,
      borderRadius: 7,
      backgroundColor: colors.rust,
      borderWidth: 2,
      borderColor: 'white',
      shadowColor: '#000',
      shadowOpacity: 0.8,
      shadowRadius: 7,
      elevation: 8,
    },
    cameraControls: {
      backgroundColor: colors.card,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 14,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    cropInstructionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      marginBottom: 11,
    },
    cropInstruction: { fontSize: 12, color: colors.muted },
    cameraError: { fontSize: 12, color: colors.rust, textAlign: 'center', marginBottom: 10 },
    cameraActionRow: { flexDirection: 'row', gap: 10 },
    cameraSecondaryAction: {
      flex: 1,
      minWidth: 106,
      minHeight: 50,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 5,
    },
    cameraSecondaryText: { fontSize: 14, fontWeight: '700', color: colors.ink },
    cameraPrimaryAction: {
      flex: 1,
      minHeight: 50,
      borderRadius: 13,
      backgroundColor: colors.rust,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    confirmBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(23,23,20,.48)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    confirmCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 22,
    },
    confirmTitle: { fontFamily: 'serif', fontSize: 24, color: colors.ink },
    confirmMessage: { fontSize: 14, lineHeight: 21, color: colors.muted, marginTop: 9 },
    confirmActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
    confirmCancel: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
      alignItems: 'center',
      borderRadius: 10,
    },
    confirmDelete: {
      flex: 1,
      backgroundColor: colors.rust,
      padding: 14,
      alignItems: 'center',
      borderRadius: 10,
    },
    descriptionInput: { minHeight: 120, textAlignVertical: 'top' },
    editCategoryList: { backgroundColor: colors.card, borderRadius: 11, overflow: 'hidden' },
    choiceRow: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    choiceImage: { width: 46, height: 46, borderRadius: 8 },
    choiceCopy: { flex: 1 },
    choiceText: { flex: 1, fontSize: 16, color: colors.ink },
    choiceDescription: { fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 3 },
    disabledText: { opacity: 0.35 },
    mergeHint: { fontSize: 12, lineHeight: 18, color: colors.muted, marginHorizontal: 12 },
    pieceActions: { flexDirection: 'row', gap: 9, marginTop: 14 },
    pieceAction: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      minHeight: 64,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 11,
    },
    pieceActionDisabled: { opacity: 0.38 },
    pieceActionText: { fontSize: 12, fontWeight: '700', color: colors.ink },
    pieceDeleteActionText: { fontSize: 12, fontWeight: '700', color: colors.rust },
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.paper,
    },
    content: { flex: 1 },
    brandBar: {
      height: 58,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      gap: 10,
    },
    brandMark: { width: 34, height: 34, borderRadius: 8 },
    brand: { fontFamily: 'serif', fontSize: 19, color: colors.ink },
    accountRow: { flexDirection: 'row', alignItems: 'center', padding: 15, gap: 12 },
    accountCopy: { flex: 1 },
    logoutButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 9, padding: 10 },
    logoutText: { color: colors.rust, fontSize: 13, fontWeight: '700' },
    page: { padding: 20, paddingBottom: 50, maxWidth: 900, width: '100%', alignSelf: 'center' },
    libraryPage: { paddingTop: 4, paddingHorizontal: 16 },
    libraryFullscreen: {
      flexGrow: 1,
      justifyContent: 'flex-start',
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 32,
      width: '100%',
    },
    resultScreen: { flex: 1, backgroundColor: colors.paper },
    resultScreenContent: { paddingBottom: 32 },
    resultHero: {
      height: 420,
      backgroundColor: '#111',
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    resultHeroImage: { width: '100%', height: '100%', resizeMode: 'contain' },
    resultBody: { paddingHorizontal: 14, paddingTop: 18 },
    resultSectionLabel: {
      fontSize: 10,
      letterSpacing: 1.5,
      fontWeight: '800',
      color: colors.muted,
      marginBottom: 2,
    },
    resultSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 26,
      marginBottom: 12,
    },
    resultSectionTitle: { fontFamily: 'serif', fontSize: 28, color: colors.ink },
    resultSaveButton: {
      minHeight: 54,
      borderRadius: 14,
      backgroundColor: colors.rust,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    librarySectionTitle: { marginTop: 10, marginBottom: 12 },
    pageHeader: { paddingVertical: 26 },
    pageHeaderCompact: { paddingTop: 12, paddingBottom: 8 },
    eyebrowCompact: { marginBottom: 5, fontSize: 9 },
    titleCompact: { fontSize: 32, lineHeight: 36 },
    copyCompact: { fontSize: 14, lineHeight: 20, marginTop: 7 },
    eyebrow: {
      fontSize: 10,
      letterSpacing: 2.2,
      fontWeight: '800',
      color: colors.rust,
      marginBottom: 10,
    },
    title: { fontFamily: 'serif', fontSize: 42, lineHeight: 44, color: colors.ink },
    copy: {
      fontFamily: 'serif',
      fontSize: 16,
      lineHeight: 24,
      color: colors.muted,
      marginTop: 14,
      maxWidth: 620,
    },
    captureCard: {
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.card,
      padding: 28,
      alignItems: 'center',
    },
    captureMark: { fontSize: 26, fontWeight: '900', color: colors.rust, marginBottom: 15 },
    cardTitle: { fontFamily: 'serif', fontSize: 20, color: colors.ink },
    muted: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
    buttonRow: { flexDirection: 'row', gap: 10, marginTop: 20, flexWrap: 'wrap' },
    primaryButton: {
      backgroundColor: colors.ink,
      paddingVertical: 14,
      paddingHorizontal: 20,
      minWidth: 130,
      alignItems: 'center',
    },
    primaryButtonText: { color: 'white', fontWeight: '700' },
    secondaryButton: {
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 14,
      paddingHorizontal: 20,
    },
    secondaryButtonText: { color: colors.ink, fontWeight: '700' },
    previewCard: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
    previewImage: {
      width: '100%',
      height: 420,
      resizeMode: 'contain',
      backgroundColor: colors.imageBackground,
    },
    cardBody: { padding: 18, flex: 1 },
    error: {
      color: colors.rust,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.rust,
      marginTop: 15,
    },
    resultSection: { marginTop: 24 },
    outfitImage: {
      width: '100%',
      aspectRatio: 1,
      resizeMode: 'cover',
      backgroundColor: colors.imageBackground,
    },
    sectionTitle: {
      fontFamily: 'serif',
      fontSize: 25,
      color: colors.ink,
      marginTop: 28,
      marginBottom: 14,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
    chip: {
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 8,
      paddingHorizontal: 11,
      backgroundColor: colors.card,
    },
    chipActive: { backgroundColor: colors.rust, borderColor: colors.rust },
    chipText: { fontSize: 11, color: colors.ink },
    chipTextActive: { color: 'white', fontWeight: '700' },
    pieceCard: {
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.card,
      marginBottom: 16,
      borderRadius: 14,
      overflow: 'hidden',
      flexDirection: 'row',
      minHeight: 210,
    },
    pieceCardExcluded: { opacity: 0.55 },
    importToggle: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
    importToggleText: { fontSize: 12, fontWeight: '800', color: colors.ink },
    pieceImage: {
      width: '42%',
      maxWidth: 220,
      minWidth: 150,
      alignSelf: 'stretch',
      resizeMode: 'contain',
      backgroundColor: colors.imageBackground,
    },
    description: { fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 7 },
    aiLabel: {
      fontSize: 9,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: colors.rust,
      marginBottom: 6,
    },
    saveButton: { backgroundColor: colors.rust, padding: 17, alignItems: 'center', marginTop: 18 },
    input: {
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.input,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flex: 1,
      color: colors.ink,
    },
    action: { color: colors.sage, fontWeight: '700', fontSize: 12 },
    deleteAction: { color: colors.rust, fontWeight: '700', fontSize: 12 },
    grid: { gap: 12 },
    gridRow: { flexDirection: 'row', gap: 12 },
    gridPlaceholder: { flex: 1 },
    gridCard: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.card,
      borderRadius: 12,
      overflow: 'hidden',
    },
    gridImage: { width: '100%', aspectRatio: 1, resizeMode: 'cover' },
    gridBody: { padding: 14 },
    gridDescription: { fontSize: 12, lineHeight: 18, color: colors.muted, padding: 12 },
    modal: { flex: 1, backgroundColor: colors.paper },
    outfitDetailContent: {
      padding: 16,
      paddingBottom: 46,
      maxWidth: 760,
      width: '100%',
      alignSelf: 'center',
    },
    outfitDetailImage: {
      width: '100%',
      height: 240,
      borderRadius: 14,
      resizeMode: 'contain',
      backgroundColor: colors.imageBackground,
    },
    outfitDescriptionCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      padding: 16,
      marginTop: 14,
    },
    detailEyebrow: {
      fontSize: 9,
      letterSpacing: 1.6,
      fontWeight: '800',
      color: colors.rust,
      marginBottom: 7,
    },
    detailItemTitle: { fontFamily: 'serif', fontSize: 20, color: colors.ink, marginBottom: 6 },
    outfitDescription: { fontFamily: 'serif', fontSize: 16, lineHeight: 23, color: colors.ink },
    detailSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 24,
      marginBottom: 12,
    },
    detailSectionTitle: { fontFamily: 'serif', fontSize: 24, color: colors.ink },
    detailCount: {
      fontSize: 12,
      color: colors.muted,
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    mappedPieceGrid: { gap: 10 },
    mappedPieceRow: { flexDirection: 'row', gap: 10 },
    mappedPieceCard: {
      flex: 1,
      minWidth: 0,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      overflow: 'hidden',
    },
    mappedPiecePlaceholder: { flex: 1 },
    mappedPieceImage: {
      width: '100%',
      aspectRatio: 1,
      resizeMode: 'cover',
      backgroundColor: colors.imageBackground,
    },
    mappedPieceBody: { padding: 12 },
    mappedPieceTitle: { fontFamily: 'serif', fontSize: 17, lineHeight: 20, color: colors.ink },
    mappedPieceDescription: { fontSize: 11, lineHeight: 16, color: colors.muted, marginTop: 5 },
    mergeSection: { marginTop: 16 },
    mergeLabel: {
      fontSize: 9,
      letterSpacing: 1.2,
      fontWeight: '800',
      color: colors.muted,
      marginBottom: 8,
    },
    mergeOptions: { gap: 8, paddingRight: 4 },
    mergeOption: {
      width: 88,
      minHeight: 104,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      backgroundColor: colors.card,
      padding: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mergeOptionActive: { borderColor: colors.rust, borderWidth: 2 },
    mergeOptionImage: {
      width: 58,
      height: 58,
      borderRadius: 7,
      resizeMode: 'cover',
      marginBottom: 6,
    },
    mergeOptionText: { fontSize: 10, lineHeight: 13, color: colors.ink, textAlign: 'center' },
    mergeNewMark: { fontSize: 25, color: colors.rust, marginBottom: 8 },
    mergeConfirmButton: {
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingVertical: 10,
      alignItems: 'center',
    },
    mergeConfirmText: { fontSize: 12, fontWeight: '800', color: colors.rust },
    dangerButton: {
      borderWidth: 1,
      borderColor: colors.rust,
      padding: 15,
      alignItems: 'center',
      marginTop: 24,
    },
    dangerText: { color: colors.rust, fontWeight: '700' },
    accordion: {
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.card,
      marginBottom: 9,
      borderRadius: 12,
      overflow: 'hidden',
    },
    accordionHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'stretch' },
    accordionToggle: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 15,
      gap: 10,
    },
    accordionIcon: { fontSize: 20, color: colors.rust, width: 16 },
    accordionName: { fontFamily: 'serif', fontSize: 19, color: colors.ink, flex: 1 },
    categoryPreviews: { flexDirection: 'row', alignItems: 'center', marginRight: 2 },
    categoryPreview: {
      width: 30,
      height: 30,
      borderRadius: 3,
      borderWidth: 2,
      borderColor: colors.card,
      resizeMode: 'cover',
      backgroundColor: colors.imageBackground,
    },
    categoryPreviewOverlap: { marginLeft: -9 },
    accordionCount: {
      fontSize: 11,
      color: colors.muted,
      backgroundColor: colors.paper,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    editButton: {
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderLeftWidth: 1,
      borderLeftColor: colors.line,
    },
    accordionBody: { borderTopWidth: 1, borderTopColor: colors.line, padding: 12 },
    emptyCategory: { fontSize: 12, color: colors.muted, paddingVertical: 10, textAlign: 'center' },
    addCategoryButton: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.rust,
      padding: 15,
      alignItems: 'center',
      marginTop: 10,
      borderRadius: 12,
      backgroundColor: 'rgba(184,79,50,.035)',
    },
    addCategoryText: { color: colors.rust, fontWeight: '800' },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(23,23,20,.32)' },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '92%',
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      overflow: 'hidden',
      backgroundColor: colors.paper,
    },
    sheetHeader: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
      backgroundColor: colors.card,
    },
    sheetTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.ink,
      textAlign: 'center',
    },
    sheetHeaderButton: { width: 82, minHeight: 48, justifyContent: 'center', paddingLeft: 16 },
    sheetHeaderButtonRight: { alignItems: 'flex-end', paddingLeft: 0, paddingRight: 16 },
    sheetHeaderSpacer: { width: 82 },
    sheetHeaderAction: { fontSize: 16, color: colors.rust },
    sheetDone: { fontWeight: '700' },
    sheetContent: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 38, gap: 18 },
    sheetSectionLabel: {
      fontSize: 12,
      lineHeight: 17,
      letterSpacing: 0.7,
      color: colors.muted,
      marginLeft: 12,
    },
    sheetGroup: { backgroundColor: colors.card, borderRadius: 11, overflow: 'hidden' },
    sheetInput: { fontSize: 17, color: colors.ink, paddingHorizontal: 16, paddingVertical: 15 },
    sheetDeleteButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
    settingsPage: {
      flexGrow: 1,
      justifyContent: 'flex-start',
      paddingTop: 12,
      paddingHorizontal: 16,
    },
    settingsSectionTitle: {
      fontSize: 12,
      letterSpacing: 1.2,
      fontWeight: '800',
      color: colors.muted,
      textTransform: 'uppercase',
      marginTop: 22,
      marginBottom: 9,
      marginLeft: 4,
    },
    settingsFirstSectionTitle: { marginTop: 0 },
    settingsGroup: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      padding: 12,
      marginBottom: 9,
    },
    settingsRowTitle: { fontFamily: 'serif', fontSize: 18, color: colors.ink, marginBottom: 10 },
    segmentedControl: {
      flexDirection: 'row',
      backgroundColor: colors.paper,
      borderRadius: 9,
      padding: 3,
      gap: 3,
    },
    segment: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 7 },
    segmentActive: { backgroundColor: colors.ink },
    segmentText: { color: colors.muted, fontWeight: '700' },
    segmentTextActive: { color: colors.card },
    settingsCategoryGroup: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      overflow: 'hidden',
    },
    settingsCategoryRow: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 15,
    },
    settingsCategoryBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    settingsCategoryName: { flex: 1, fontSize: 16, color: colors.ink },
    settingsEditButton: { minHeight: 50, justifyContent: 'center', paddingHorizontal: 16 },
    settingsAddButton: { padding: 14, alignItems: 'center', marginTop: 8, marginBottom: 4 },
    tabSafeArea: { backgroundColor: colors.card },
    tabs: {
      height: 72,
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingHorizontal: 10,
      paddingTop: 7,
      paddingBottom: 9,
      gap: 5,
    },
    tab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
    tabActive: { backgroundColor: colors.paper },
    tabText: { fontSize: 12, color: colors.muted, textTransform: 'capitalize' },
    tabTextActive: { color: colors.rust, fontWeight: '800' },
  });
}
function withAlignedCardText(
  next: ReturnType<typeof createStyles>,
): ReturnType<typeof createStyles> {
  return {
    ...next,
    gridCard: {
      ...StyleSheet.flatten(next.gridCard),
      paddingHorizontal: 12,
    } as typeof next.gridCard,
    gridImage: {
      ...StyleSheet.flatten(next.gridImage),
      width: 'auto',
      marginHorizontal: -12,
    } as unknown as typeof next.gridImage,
    gridBody: {
      ...StyleSheet.flatten(next.gridBody),
      paddingHorizontal: 0,
    } as typeof next.gridBody,
    gridDescription: { ...StyleSheet.flatten(next.gridDescription), padding: 0 },
  };
}
let styles = withAlignedCardText(createStyles(colors));
