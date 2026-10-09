import { StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../ui/Text';
import { colors, radius } from '../../theme';

interface ProductImageProps {
  uri?: string | null;
  name: string;
  size?: number;
  /** Category accent, so a placeholder still carries a hint of what it is. */
  accent?: string | null;
  icon?: string | null;
  rounded?: number;
  /**
   * Applied to whichever element renders. Typed as the intersection because the
   * photo branch is an Image and the placeholder branch is a View, and RN keeps
   * ImageStyle and ViewStyle separate (they disagree on `overflow`).
   */
  style?: StyleProp<ViewStyle & ImageStyle>;
}

const withAlpha = (hex: string, alpha: string): string => {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean;
  return `#${full}${alpha}`;
};

/**
 * Product thumbnail with a designed fallback.
 *
 * Most catalogues are only partly photographed, so the placeholder has to look
 * intentional rather than broken: a tint from the product's category plus its
 * icon, with the initial as a last resort.
 */
export const ProductImage = ({
  uri,
  name,
  size = 56,
  accent,
  icon,
  rounded,
  style,
}: ProductImageProps) => {
  const borderRadius = rounded ?? radius.md;
  const tint = accent ?? colors.primary;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[{ width: size, height: size, borderRadius }, styles.image, style as StyleProp<ImageStyle>]}
        contentFit="cover"
        // Small in-memory cache keeps a scrolled list from re-decoding rows.
        cachePolicy="memory-disk"
        transition={180}
        accessibilityLabel={name}
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: withAlpha(tint, '18'),
          borderColor: withAlpha(tint, '33'),
        },
        style,
      ]}
    >
      {icon ? (
        <Ionicons name={icon as never} size={size * 0.42} color={tint} />
      ) : (
        <Text variant="h3" style={{ color: tint, fontSize: size * 0.34 }}>
          {name.trim().charAt(0).toUpperCase() || '?'}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surfaceAlt },
  placeholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
