import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';

/**
 * While `dirty`, leaving the screen (back button, swipe, tab pop) asks before
 * throwing away unsaved edits.
 */
export function useDiscardGuard(dirty: boolean, message = 'Your changes have not been saved.') {
  const navigation = useNavigation();

  useEffect(() => {
    if (!dirty) return;
    return navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      Alert.alert('Discard changes?', message, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
      ]);
    });
  }, [dirty, message, navigation]);
}
