import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PurchasesPackage } from '@/lib/storekit';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { PREMIUM_PRODUCT_IDS, useSubscription } from '@/lib/storekit';
import { useAnalyzeDatingProfile, type DatingProfileAnalysis } from '@/lib/api-client';

type Screen = 'home' | 'categories' | 'assessment' | 'results' | 'journal' | 'entry' | 'premium' | 'profile-reader' | 'dating-tracker' | 'dating-file';
type CategoryKey =
  | 'relationship'
  | 'money'
  | 'gaslighting'
  | 'controlling'
  | 'digital'
  | 'isolation'
  | 'communication'
  | 'threats';

type Category = {
  key: CategoryKey;
  label: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
  pattern: string;
  explanation: string;
};

type Question = {
  prompt: string;
  category?: CategoryKey;
};

type JournalEntry = {
  id: string;
  createdAt: string;
  category: CategoryKey | 'general';
  whatHappened: string;
  whatWasSaid: string;
  whoWasPresent: string;
  before: string;
  after: string;
  financialImpact: string;
  feelings: string;
  response: string;
};

type AssessmentResult = {
  category: CategoryKey;
  answers: number[];
  createdAt: string;
};

type TrackerItem = {
  id: string;
  label: string;
  selected: boolean;
  custom?: boolean;
};

type DateNote = {
  id: string;
  label: string;
  notes: string;
  createdAt: string;
};

type DatingFile = {
  id: string;
  name: string;
  createdAt: string;
  positiveTraits: TrackerItem[];
  noTraits: TrackerItem[];
  dateNotes: DateNote[];
  stoppedDating: boolean;
  closureNote: string;
};

const STORAGE_KEYS = {
  entries: '@red-flag/journal',
  assessments: '@red-flag/assessments',
  datingTracker: '@red-flag/dating-tracker',
  profileReads: '@red-flag/profile-reads',
};

const starterPositiveTraits = [
  'Communicates clearly and consistently',
  'Respects my boundaries and my “no”',
  'Takes accountability and can apologize',
  'Follows through on what he says',
  'Shows genuine curiosity about my life',
  'Handles disappointment without punishing me',
  'Is kind to service workers and other people',
  'Has a life, interests, and support system of his own',
  'Makes space for my pace and comfort',
  'Can talk through conflict without insults',
  'Is honest about intentions and relationship goals',
  'Respects my privacy, time, friends, and independence',
].map((label, index) => ({ id: `positive-${index}`, label, selected: false }));

const addedNoTraitLabels = [
  'Asks what I bring to the table as if I need to prove my worth',
  'Acts like he is “the prize” and I should compete for him',
  'Asks to split the tab',
];

const starterNoTraits = [
  'Pressures me to move faster than feels right',
  'Dismisses, mocks, or argues with my boundaries',
  'Blames every ex and takes no responsibility',
  'Uses jealousy or control as proof of caring',
  'Love-bombs, then withdraws or punishes me',
  'Feels entitled to sex, money, attention, or access',
  'Lies, hides important information, or changes stories',
  'Insults me, threatens me, or uses intimidation',
  'Tries to isolate me from friends, family, or support',
  'Monitors my phone, location, clothes, or social life',
  'Is cruel to service workers, animals, or vulnerable people',
  'Makes racist, sexist, homophobic, or degrading comments',
  ...addedNoTraitLabels,
].map((label, index) => ({ id: `no-${index}`, label, selected: false }));

const categories: Category[] = [
  {
    key: 'relationship',
    label: 'Relationship',
    description: 'Respect, boundaries, and emotional safety',
    icon: 'heart',
    pattern: 'Relationship dynamics',
    explanation: 'Repeated tension around respect, boundaries, or emotional safety can be worth slowing down to examine. One difficult moment does not define a relationship; patterns over time give more useful context.',
  },
  {
    key: 'money',
    label: 'Money',
    description: 'Access, spending, and financial pressure',
    icon: 'credit-card',
    pattern: 'Financial control',
    explanation: 'Financial control can involve monitoring, restricting, withholding, or using money to pressure another person. A disagreement about money is not automatically concerning; recurring control, fear, restriction, or punishment may be worth documenting.',
  },
  {
    key: 'gaslighting',
    label: 'Gaslighting',
    description: 'Denial, memory, and your perception',
    icon: 'help-circle',
    pattern: 'Reality and memory conflicts',
    explanation: 'Repeated denial, rewriting events, or dismissing your perception can make it harder to trust your own memory. Writing down specific moments may help you notice whether this is occasional conflict or a recurring dynamic.',
  },
  {
    key: 'controlling',
    label: 'Controlling behavior',
    description: 'Rules, monitoring, jealousy, and restrictions',
    icon: 'lock',
    pattern: 'Controlling behavior',
    explanation: 'Rules, monitoring, jealousy, or pressure to change ordinary behavior can affect your freedom. Healthy agreements are mutual and revisable; repeated restrictions are worth reflecting on in context.',
  },
  {
    key: 'digital',
    label: 'Digital monitoring',
    description: 'Phone access, passwords, and location',
    icon: 'smartphone',
    pattern: 'Digital privacy pressure',
    explanation: 'Requests for passwords, phone access, location, or social media monitoring can cross personal boundaries when they are demanded, secretive, or tied to consequences. Your digital privacy and consent matter.',
  },
  {
    key: 'isolation',
    label: 'Isolation',
    description: 'Friends, family, coworkers, and support',
    icon: 'users',
    pattern: 'Connection and support',
    explanation: 'Being discouraged from contacting friends, family, coworkers, or support systems can reduce your access to perspective and care. Notice whether contact is freely chosen or repeatedly punished and restricted.',
  },
  {
    key: 'communication',
    label: 'Communication',
    description: 'Guilt, blame-shifting, silence, and intimidation',
    icon: 'message-circle',
    pattern: 'Unhealthy communication',
    explanation: 'Guilt, intimidation, silent treatment, blame-shifting, or recurring threats can make disagreements feel unsafe. Reflecting on what happens before and after conflict can clarify the pattern.',
  },
  {
    key: 'threats',
    label: 'Threats / intimidation',
    description: 'Fear, coercion, and feeling unsafe',
    icon: 'alert-triangle',
    pattern: 'Threats and intimidation',
    explanation: 'Threats, coercion, or behavior that makes you feel unsafe deserve care and support. This app cannot assess immediate danger. If you may be in immediate danger, contact local emergency services or someone you trust.',
  },
];

const questionBank: Question[] = [
  { prompt: 'Does this happen repeatedly rather than as a one-time disagreement?' },
  { prompt: 'Do you feel pressured to agree because you are afraid of the other person’s reaction?' },
  { prompt: 'Do you find yourself constantly explaining or defending ordinary choices?' },
  { prompt: 'Are you punished, ignored, threatened, or given the silent treatment after setting a boundary?' },
  { prompt: 'Does the other person deny events that you clearly remember happening?', category: 'gaslighting' },
  { prompt: 'Are you discouraged from spending time with friends or family?', category: 'isolation' },
  { prompt: 'Does the other person demand access to your phone, passwords, messages, or location?', category: 'digital' },
  { prompt: 'Are you expected to account for your spending or justify purchases in ways that feel controlling?', category: 'money' },
  { prompt: 'Has your access to shared or personal money been restricted?', category: 'money' },
  { prompt: 'Do you feel that disagreements regularly become your fault?', category: 'communication' },
  { prompt: 'Do you change your behavior primarily to avoid the other person becoming angry?', category: 'threats' },
  { prompt: 'Do you feel afraid to say no?', category: 'threats' },
  { prompt: 'Has the behavior become more frequent or intense over time?' },
  { prompt: 'Do you feel less confident in your own judgment since the relationship began?' },
];

const answerLabels = ['Not at all', 'Sometimes', 'Often', 'Very often'];

function getQuestions(category: CategoryKey): Question[] {
  const targeted = questionBank.filter((question) => question.category === category);
  const general = questionBank.filter((question) => !question.category);
  return [...targeted, ...general].slice(0, 5);
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDate(dateValue: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateValue));
}

export default function RedFlagHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const subscription = useSubscription();
  const [screen, setScreen] = useState<Screen>('home');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [assessments, setAssessments] = useState<AssessmentResult[]>([]);
  const isPremium = subscription.isSubscribed;
  const [pendingPurchase, setPendingPurchase] = useState<PurchasesPackage | null>(null);
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [lastResult, setLastResult] = useState<AssessmentResult | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState<Partial<JournalEntry>>({});
  const [search, setSearch] = useState('');
  const [journalFilter, setJournalFilter] = useState<CategoryKey | 'all'>('all');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileAnalysis, setProfileAnalysis] = useState<DatingProfileAnalysis | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileReadCount, setProfileReadCount] = useState(0);
  const [cameraGranted, setCameraGranted] = useState<boolean | null>(null);
  const [datingFiles, setDatingFiles] = useState<DatingFile[]>([]);
  const [selectedDatingFileId, setSelectedDatingFileId] = useState<string | null>(null);
  const [newDatingName, setNewDatingName] = useState('');
  const [newDateLabel, setNewDateLabel] = useState('');
  const [newDateNotes, setNewDateNotes] = useState('');
  const [newPositiveTrait, setNewPositiveTrait] = useState('');
  const [newNoTrait, setNewNoTrait] = useState('');
  const [deleteConfirmFileId, setDeleteConfirmFileId] = useState<string | null>(null);
  const profileReader = useAnalyzeDatingProfile();

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.entries),
      AsyncStorage.getItem(STORAGE_KEYS.assessments),
      AsyncStorage.getItem(STORAGE_KEYS.datingTracker),
      AsyncStorage.getItem(STORAGE_KEYS.profileReads),
    ]).then(([savedEntries, savedAssessments, savedTracker, savedProfileReads]) => {
      setEntries(savedEntries ? (JSON.parse(savedEntries) as JournalEntry[]) : []);
      setAssessments(savedAssessments ? (JSON.parse(savedAssessments) as AssessmentResult[]) : []);
      setProfileReadCount(savedProfileReads ? Number.parseInt(savedProfileReads, 10) || 0 : 0);
      if (savedTracker) {
        const storedFiles = JSON.parse(savedTracker) as DatingFile[];
        const updatedFiles = storedFiles.map((file) => {
          const existingLabels = new Set(file.noTraits.map((item) => item.label.toLowerCase()));
          const additions = addedNoTraitLabels
            .filter((label) => !existingLabels.has(label.toLowerCase()))
            .map((label, index) => ({ id: `no-added-${index}`, label, selected: false }));
          return additions.length ? { ...file, noTraits: [...file.noTraits, ...additions] } : file;
        });
        setDatingFiles(updatedFiles);
        void AsyncStorage.setItem(STORAGE_KEYS.datingTracker, JSON.stringify(updatedFiles));
      }
      setHydrated(true);
    }).catch(() => setHydrated(true));
  }, []);

  const persistEntries = async (next: JournalEntry[]) => {
    setEntries(next);
    await AsyncStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(next));
  };

  const persistAssessments = async (next: AssessmentResult[]) => {
    setAssessments(next);
    await AsyncStorage.setItem(STORAGE_KEYS.assessments, JSON.stringify(next));
  };

  const persistDatingFiles = async (next: DatingFile[]) => {
    setDatingFiles(next);
    await AsyncStorage.setItem(STORAGE_KEYS.datingTracker, JSON.stringify(next));
  };

  const updateDatingFile = (fileId: string, update: (file: DatingFile) => DatingFile) => {
    void persistDatingFiles(datingFiles.map((file) => file.id === fileId ? update(file) : file));
  };

  const createDatingFile = () => {
    if (!isPremium && datingFiles.length >= 3) {
      setScreen('premium');
      return;
    }
    const name = newDatingName.trim();
    if (!name) {
      Alert.alert('Add his name', 'Give this dating file a name so you can find it later.');
      return;
    }
    const file: DatingFile = {
      id: makeId(),
      name,
      createdAt: new Date().toISOString(),
      positiveTraits: starterPositiveTraits.map((item) => ({ ...item })),
      noTraits: starterNoTraits.map((item) => ({ ...item })),
      dateNotes: [],
      stoppedDating: false,
      closureNote: '',
    };
    void persistDatingFiles([file, ...datingFiles]);
    setNewDatingName('');
    setSelectedDatingFileId(file.id);
    setScreen('dating-file');
  };

  const toggleTrackerItem = (kind: 'positive' | 'no', id: string) => {
    if (!selectedDatingFileId) return;
    updateDatingFile(selectedDatingFileId, (file) => ({
      ...file,
      [kind === 'positive' ? 'positiveTraits' : 'noTraits']: (kind === 'positive' ? file.positiveTraits : file.noTraits)
        .map((item) => item.id === id ? { ...item, selected: !item.selected } : item),
    }));
  };

  const addTrackerItem = (kind: 'positive' | 'no') => {
    if (!selectedDatingFileId) return;
    const value = (kind === 'positive' ? newPositiveTrait : newNoTrait).trim();
    const file = datingFiles.find((item) => item.id === selectedDatingFileId);
    if (!value || !file) return;
    const current = kind === 'positive' ? file.positiveTraits : file.noTraits;
    if (current.some((item) => item.label.toLowerCase() === value.toLowerCase())) return;
    const item: TrackerItem = { id: makeId(), label: value, selected: true, custom: true };
    updateDatingFile(selectedDatingFileId, (currentFile) => ({
      ...currentFile,
      [kind === 'positive' ? 'positiveTraits' : 'noTraits']: [...current, item],
    }));
    if (kind === 'positive') setNewPositiveTrait('');
    else setNewNoTrait('');
  };

  const removeTrackerItem = (kind: 'positive' | 'no', id: string) => {
    if (!selectedDatingFileId) return;
    updateDatingFile(selectedDatingFileId, (file) => ({
      ...file,
      [kind === 'positive' ? 'positiveTraits' : 'noTraits']: (kind === 'positive' ? file.positiveTraits : file.noTraits).filter((item) => item.id !== id),
    }));
  };

  const addDateNote = () => {
    if (!selectedDatingFileId || !newDateNotes.trim()) {
      Alert.alert('Add a note', 'Write down what you want to remember about this date.');
      return;
    }
    updateDatingFile(selectedDatingFileId, (file) => ({
      ...file,
      dateNotes: [
        ...file.dateNotes,
        {
          id: makeId(),
          label: newDateLabel.trim() || `Date ${file.dateNotes.length + 1}`,
          notes: newDateNotes.trim(),
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    setNewDateLabel('');
    setNewDateNotes('');
  };

  const saveClosureNote = (stoppedDating: boolean, closureNote: string) => {
    if (!selectedDatingFileId) return;
    updateDatingFile(selectedDatingFileId, (file) => ({ ...file, stoppedDating, closureNote }));
  };

  const deleteDatingFile = (file: DatingFile) => {
    setDeleteConfirmFileId(file.id);
  };

  const confirmDeleteDatingFile = (file: DatingFile) => {
    void persistDatingFiles(datingFiles.filter((item) => item.id !== file.id));
    setDeleteConfirmFileId(null);
    setSelectedDatingFileId(null);
    setScreen('dating-tracker');
  };

  const goTo = async (next: Screen) => {
    await Haptics.selectionAsync();
    setScreen(next);
  };

  const startAssessment = (category: CategoryKey) => {
    if (!isPremium && assessments.length >= 3) {
      setScreen('premium');
      return;
    }
    setSelectedCategory(category);
    setAnswers([]);
    setQuestionIndex(0);
    setScreen('assessment');
  };

  const chooseAnswer = (value: number) => {
    setAnswers((previous) => {
      const next = [...previous];
      next[questionIndex] = value;
      return next;
    });
  };

  const finishAssessment = async () => {
    if (!selectedCategory) return;
    const result: AssessmentResult = {
      category: selectedCategory,
      answers,
      createdAt: new Date().toISOString(),
    };
    await persistAssessments([result, ...assessments]);
    setLastResult(result);
    setScreen('results');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const saveEntry = async () => {
    if (!draft.whatHappened?.trim()) {
      Alert.alert('Add a little more', 'Write what happened so this entry has a clear anchor.');
      return;
    }
    const entry: JournalEntry = {
      id: makeId(),
      createdAt: draft.createdAt ?? new Date().toISOString(),
      category: draft.category ?? 'general',
      whatHappened: draft.whatHappened.trim(),
      whatWasSaid: draft.whatWasSaid?.trim() ?? '',
      whoWasPresent: draft.whoWasPresent?.trim() ?? '',
      before: draft.before?.trim() ?? '',
      after: draft.after?.trim() ?? '',
      financialImpact: draft.financialImpact?.trim() ?? '',
      feelings: draft.feelings?.trim() ?? '',
      response: draft.response?.trim() ?? '',
    };
    await persistEntries([entry, ...entries]);
    setDraft({});
    setScreen('journal');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const deleteEntry = (entryId: string) => {
    Alert.alert('Delete this entry?', 'This removes it from this device and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void persistEntries(entries.filter((entry) => entry.id !== entryId)),
      },
    ]);
  };

  const openNewEntry = (category: CategoryKey | 'general' = 'general') => {
    if (!isPremium && entries.length >= 10) {
      setScreen('premium');
      return;
    }
    setDraft({ category });
    setScreen('entry');
  };

  const openProfileReader = () => {
    if (!isPremium && profileReadCount >= 3) {
      setScreen('premium');
      return;
    }
    setProfileError(null);
    setProfileAnalysis(null);
    setProfileImage(null);
    setScreen('profile-reader');
  };

  const readProfileImage = async (source: 'camera' | 'library') => {
    setProfileError(null);
    if (source === 'camera' && cameraGranted !== true) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      setCameraGranted(permission.granted);
      if (!permission.granted) {
        setProfileError(permission.canAskAgain ? 'Camera access is needed to scan a profile.' : 'Camera access is off. You can still choose a saved screenshot from your library.');
        return;
      }
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;

    const asset = result.assets[0];
    const imageData = asset.base64;
    if (!imageData) return;
    const mimeType = asset.mimeType === 'image/png' ? 'image/png' : asset.mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
    setProfileImage(asset.uri);
    setProfileAnalysis(null);
    profileReader.mutate(
      { data: { imageData, mimeType } },
      {
        onSuccess: (analysis) => {
          setProfileAnalysis(analysis);
          if (!isPremium) {
            const nextCount = profileReadCount + 1;
            setProfileReadCount(nextCount);
            void AsyncStorage.setItem(STORAGE_KEYS.profileReads, String(nextCount));
          }
        },
        onError: () => setProfileError('The profile could not be analyzed right now. Try a clearer screenshot with the profile text fully visible.'),
      },
    );
  };

  const filteredEntries = entries.filter((entry) => {
    const matchesFilter = journalFilter === 'all' || entry.category === journalFilter;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [entry.whatHappened, entry.whatWasSaid, entry.feelings].join(' ').toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  const categoryForKey = (key: CategoryKey | 'general') => categories.find((category) => category.key === key);
  const activeCategory = selectedCategory ? categoryForKey(selectedCategory) : undefined;
  const currentQuestions = selectedCategory ? getQuestions(selectedCategory) : [];
  const currentQuestion = currentQuestions[questionIndex];
  const resultCategory = lastResult ? categoryForKey(lastResult.category) : undefined;
  const score = lastResult ? lastResult.answers.reduce((sum, answer) => sum + answer, 0) : 0;
  const resultTone = score >= 10 ? 'Worth a closer look' : score >= 5 ? 'Some things to reflect on' : 'A moment to notice';
  const selectedDatingFile = datingFiles.find((file) => file.id === selectedDatingFileId);

  if (!hydrated) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const screenHeader = (title: string, subtitle?: string, backScreen: Screen = 'home') => (
    <View style={[styles.screenHeader, { paddingTop: Math.max(insets.top, 16) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12} onPress={() => void goTo(backScreen)} style={styles.iconButton}>
        <Feather name="arrow-left" size={21} color={colors.foreground} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>BABES RISING</Text>
        <Text style={styles.screenTitle}>{title}</Text>
        {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );

  if (screen === 'categories') {
    return (
      <View style={styles.root}>
        {screenHeader('Choose a situation', 'Start with what feels closest. You can explore more than one category.')}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.categoryGrid}>
            {categories.map((category) => {
              const selected = selectedCategory === category.key;
              return (
                <Pressable
                  key={category.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${category.label}`}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSelectedCategory(category.key);
                  }}
                  style={({ pressed }) => [styles.categoryCard, selected && styles.categoryCardSelected, pressed && styles.pressed]}
                >
                  <View style={[styles.categoryIcon, selected && styles.categoryIconSelected]}>
                    <Feather name={category.icon} size={21} color={selected ? colors.primaryForeground : colors.primary} />
                  </View>
                  <Text style={styles.categoryLabel}>{category.label}</Text>
                  <Text style={styles.categoryDescription}>{category.description}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Begin assessment"
            disabled={!selectedCategory}
            onPress={() => selectedCategory && startAssessment(selectedCategory)}
            style={({ pressed }) => [styles.primaryButton, !selectedCategory && styles.disabledButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>Begin assessment</Text>
            <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
          </Pressable>
          <Text style={styles.disclaimer}>Your answers are for reflection, not a diagnosis or a definitive judgment about another person.</Text>
        </ScrollView>
      </View>
    );
  }

  if (screen === 'assessment' && currentQuestion && activeCategory) {
    const selectedAnswer = answers[questionIndex];
    return (
      <View style={styles.root}>
        <View style={[styles.assessmentTop, { paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Exit assessment" onPress={() => void goTo('home')} style={styles.iconButton}>
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((questionIndex + 1) / currentQuestions.length) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{questionIndex + 1}/{currentQuestions.length}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.assessmentContent} showsVerticalScrollIndicator={false}>
          <View style={styles.assessmentMeta}>
            <View style={styles.tinyPill}>
              <Feather name={activeCategory.icon} size={13} color={colors.primary} />
              <Text style={styles.tinyPillText}>{activeCategory.label}</Text>
            </View>
            <Text style={styles.questionKicker}>Take your time</Text>
          </View>
          <Text style={styles.questionText}>{currentQuestion.prompt}</Text>
          <Text style={styles.questionHint}>There is no right answer. Choose what best matches your experience.</Text>
          <View style={styles.answerList}>
            {answerLabels.map((label, index) => {
              const isSelected = selectedAnswer === index;
              return (
                <Pressable
                  key={label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => chooseAnswer(index)}
                  style={({ pressed }) => [styles.answerRow, isSelected && styles.answerRowSelected, pressed && styles.pressed]}
                >
                  <View style={[styles.radio, isSelected && styles.radioSelected]}>
                    {isSelected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text style={[styles.answerText, isSelected && styles.answerTextSelected]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View style={[styles.bottomAction, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={questionIndex === currentQuestions.length - 1 ? 'See results' : 'Next question'}
            disabled={selectedAnswer === undefined}
            onPress={() => {
              if (questionIndex === currentQuestions.length - 1) {
                void finishAssessment();
              } else {
                setQuestionIndex(questionIndex + 1);
              }
            }}
            style={({ pressed }) => [styles.primaryButton, selectedAnswer === undefined && styles.disabledButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>{questionIndex === currentQuestions.length - 1 ? 'See results' : 'Next question'}</Text>
            <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>
    );
  }

  if (screen === 'results' && resultCategory && lastResult) {
    return (
      <View style={styles.root}>
        {screenHeader('A moment to reflect', 'Your answers suggest a possible pattern to explore—not a diagnosis.')}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={[colors.accent, colors.card]} style={styles.resultHero}>
            <View style={styles.resultIcon}>
              <Feather name={resultCategory.icon} size={25} color={colors.primaryForeground} />
            </View>
            <Text style={styles.resultTone}>{resultTone}</Text>
            <Text style={styles.resultPattern}>{resultCategory.pattern}</Text>
            <Text style={styles.resultExplanation}>{resultCategory.explanation}</Text>
          </LinearGradient>
          <View style={styles.reflectionCard}>
            <Text style={styles.cardEyebrow}>QUESTIONS TO CONSIDER</Text>
            {['Is this a recurring pattern?', 'What happens when you set a reasonable boundary?', 'How does this affect your sense of safety, freedom, or confidence?', 'Would you describe this situation to someone you trust?'].map((question) => (
              <View key={question} style={styles.reflectionRow}>
                <Feather name="circle" size={11} color={colors.primary} />
                <Text style={styles.reflectionText}>{question}</Text>
              </View>
            ))}
          </View>
          <View style={styles.safetyNote}>
            <Feather name="shield" size={18} color={colors.secondaryForeground} />
            <Text style={styles.safetyText}>Documenting specific moments can help you look for patterns over time. Keep sensitive information off the app if storing it could put you at greater risk.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => openNewEntry(lastResult.category)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Feather name="edit-3" size={18} color={colors.primaryForeground} />
            <Text style={styles.primaryButtonText}>Document what happened</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void goTo('home')} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>Back to home</Text>
          </Pressable>
          <Text style={styles.resultDate}>Assessment saved {formatDate(lastResult.createdAt)}</Text>
        </ScrollView>
      </View>
    );
  }

  if (screen === 'journal') {
    return (
      <View style={styles.root}>
        {screenHeader('Private journal', 'Your entries stay on this device in this MVP.')}
        <View style={styles.journalToolbar}>
          <View style={styles.searchBox}>
            <Feather name="search" size={17} color={colors.mutedForeground} />
            <TextInput
              accessibilityLabel="Search journal"
              value={search}
              onChangeText={setSearch}
              placeholder="Search your entries"
              placeholderTextColor={colors.mutedForeground}
              style={styles.searchInput}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <Pressable onPress={() => setJournalFilter('all')} style={[styles.filterPill, journalFilter === 'all' && styles.filterPillSelected]}>
              <Text style={[styles.filterText, journalFilter === 'all' && styles.filterTextSelected]}>All</Text>
            </Pressable>
            {categories.map((category) => (
              <Pressable key={category.key} onPress={() => setJournalFilter(category.key)} style={[styles.filterPill, journalFilter === category.key && styles.filterPillSelected]}>
                <Text style={[styles.filterText, journalFilter === category.key && styles.filterTextSelected]}>{category.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 28) }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={filteredEntries.length > 0}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><Feather name="book-open" size={24} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>{search || journalFilter !== 'all' ? 'Nothing matches yet' : 'Your timeline starts here'}</Text>
              <Text style={styles.emptyText}>{search || journalFilter !== 'all' ? 'Try another search or category.' : 'Write down the details while they are still clear. Small notes can become useful context later.'}</Text>
              <Pressable onPress={() => openNewEntry()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Feather name="plus" size={18} color={colors.primaryForeground} />
                <Text style={styles.primaryButtonText}>New journal entry</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => {
            const entryCategory = categoryForKey(item.category);
            return (
              <Pressable onLongPress={() => deleteEntry(item.id)} style={({ pressed }) => [styles.entryCard, pressed && styles.pressed]}>
                <View style={styles.entryCardTop}>
                  <View style={styles.entryTag}>
                    <Text style={styles.entryTagText}>{entryCategory?.label ?? 'General'}</Text>
                  </View>
                  <Text style={styles.entryDate}>{formatDate(item.createdAt)}</Text>
                </View>
                <Text style={styles.entryTitle} numberOfLines={2}>{item.whatHappened}</Text>
                {item.feelings ? <Text style={styles.entryPreview} numberOfLines={2}>{item.feelings}</Text> : null}
                <Text style={styles.entryHint}>Press and hold to delete</Text>
              </Pressable>
            );
          }}
        />
        {filteredEntries.length > 0 ? (
          <Pressable onPress={() => openNewEntry()} accessibilityRole="button" accessibilityLabel="New journal entry" style={({ pressed }) => [styles.floatingButton, { bottom: Math.max(insets.bottom, 20) }, pressed && styles.pressed]}>
            <Feather name="plus" size={22} color={colors.primaryForeground} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (screen === 'entry') {
    const updateDraft = (field: keyof JournalEntry, value: string) => setDraft((previous) => ({ ...previous, [field]: value }));
    return (
      <View style={styles.root}>
        {screenHeader('Document what happened', 'A private, factual note can help you see context over time.')}
        <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.formContent, { paddingBottom: Math.max(insets.bottom, 34) }]} showsVerticalScrollIndicator={false}>
          <Text style={styles.formLabel}>What happened? <Text style={styles.requiredMark}>*</Text></Text>
          <TextInput value={draft.whatHappened ?? ''} onChangeText={(value) => updateDraft('whatHappened', value)} placeholder="Describe the moment in your own words" placeholderTextColor={colors.mutedForeground} multiline style={[styles.textArea, styles.textAreaLarge]} />
          <Text style={styles.formLabel}>What was said?</Text>
          <TextInput value={draft.whatWasSaid ?? ''} onChangeText={(value) => updateDraft('whatWasSaid', value)} placeholder="Capture words or phrases you remember" placeholderTextColor={colors.mutedForeground} multiline style={styles.textArea} />
          <Text style={styles.formLabel}>Who was present?</Text>
          <TextInput value={draft.whoWasPresent ?? ''} onChangeText={(value) => updateDraft('whoWasPresent', value)} placeholder="People, children, or others nearby" placeholderTextColor={colors.mutedForeground} style={styles.textInput} />
          <View style={styles.formSplit}>
            <View style={styles.formHalf}>
              <Text style={styles.formLabel}>Immediately before</Text>
              <TextInput value={draft.before ?? ''} onChangeText={(value) => updateDraft('before', value)} placeholder="What led up to it?" placeholderTextColor={colors.mutedForeground} multiline style={styles.textAreaSmall} />
            </View>
            <View style={styles.formHalf}>
              <Text style={styles.formLabel}>Afterward</Text>
              <TextInput value={draft.after ?? ''} onChangeText={(value) => updateDraft('after', value)} placeholder="What happened next?" placeholderTextColor={colors.mutedForeground} multiline style={styles.textAreaSmall} />
            </View>
          </View>
          <Text style={styles.formLabel}>How did you feel?</Text>
          <TextInput value={draft.feelings ?? ''} onChangeText={(value) => updateDraft('feelings', value)} placeholder="Name what you noticed in yourself" placeholderTextColor={colors.mutedForeground} multiline style={styles.textArea} />
          <Text style={styles.formLabel}>What did you do?</Text>
          <TextInput value={draft.response ?? ''} onChangeText={(value) => updateDraft('response', value)} placeholder="How did you respond or care for yourself?" placeholderTextColor={colors.mutedForeground} multiline style={styles.textArea} />
          <Text style={styles.formLabel}>Financial impact <Text style={styles.optionalMark}>Optional</Text></Text>
          <TextInput value={draft.financialImpact ?? ''} onChangeText={(value) => updateDraft('financialImpact', value)} placeholder="Purchases, access, or pressure related to money" placeholderTextColor={colors.mutedForeground} multiline style={styles.textArea} />
          <View style={styles.privateCallout}>
            <Feather name="lock" size={17} color={colors.primary} />
            <Text style={styles.privateCalloutText}>This MVP stores entries locally on this device. If keeping a record could put you at greater risk, consider not saving it here.</Text>
          </View>
          <Pressable onPress={() => void saveEntry()} accessibilityRole="button" style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>Save entry</Text>
            <Feather name="check" size={18} color={colors.primaryForeground} />
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  if (screen === 'premium') {
    const planOrder: string[] = [PREMIUM_PRODUCT_IDS.monthly, PREMIUM_PRODUCT_IDS.yearly, PREMIUM_PRODUCT_IDS.lifetime];
    const freeTrialLabel = (item: PurchasesPackage) => item.identifier === PREMIUM_PRODUCT_IDS.yearly ? '7-day free trial' : null;
    const packages = subscription.offerings?.current?.availablePackages
      .filter((item) => planOrder.includes(item.identifier))
      .sort((a, b) => planOrder.indexOf(a.identifier) - planOrder.indexOf(b.identifier)) ?? [];
    const confirmPurchase = async () => {
      if (!pendingPurchase) return;
      setPurchaseMessage(null);
      try {
        await subscription.purchase(pendingPurchase);
        setPendingPurchase(null);
        setPurchaseMessage('Premium is active. Welcome to the full Babes Rising toolkit.');
        setScreen('home');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The purchase could not be completed.';
        if (!message.toLowerCase().includes('cancel')) setPurchaseMessage(message);
        setPendingPurchase(null);
      }
    };
    const restorePurchases = async () => {
      setPurchaseMessage(null);
      try {
        const info = await subscription.restore();
        const restored = info.entitlements.active.premium !== undefined;
        setPurchaseMessage(restored ? 'Your Premium access has been restored.' : 'No active Premium purchase was found.');
      } catch (error) {
        setPurchaseMessage(error instanceof Error ? error.message : 'Purchases could not be restored.');
      }
    };
    return (
      <View style={styles.root}>
        {screenHeader('See the bigger picture', 'Keep documenting, spot patterns over time, and access the complete Babes Rising toolkit.')}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={[colors.primary, colors.accent]} style={styles.premiumHero}>
            <View style={styles.premiumMark}><Feather name="layers" size={23} color={colors.primaryForeground} /></View>
            <Text style={styles.premiumTitle}>More context, when you need it.</Text>
            <Text style={styles.premiumBody}>Premium keeps your private timeline open for deeper reflection.</Text>
          </LinearGradient>
          <View style={styles.planList}>
            {subscription.isLoading ? <ActivityIndicator color={colors.primary} /> : packages.map((item) => {
              const yearly = item.identifier === PREMIUM_PRODUCT_IDS.yearly;
              const lifetime = item.identifier === PREMIUM_PRODUCT_IDS.lifetime;
              const trial = freeTrialLabel(item);
              return (
              <Pressable key={item.identifier} onPress={() => { setPurchaseMessage(null); setPendingPurchase(item); }} style={({ pressed }) => [styles.planCard, yearly && styles.planCardFeatured, pressed && styles.pressed]}>
                <View>
                  <Text style={styles.planName}>{yearly ? 'Yearly · Best value' : lifetime ? 'Lifetime' : 'Monthly'}</Text>
                  {trial ? <Text style={styles.trialText}>{trial}</Text> : null}
                  <Text style={styles.planPrice}>{item.product.priceString}{lifetime ? ' one-time' : ` / ${yearly ? 'year' : 'month'}`}</Text>
                </View>
                <Feather name="chevron-right" size={19} color={yearly ? colors.primary : colors.mutedForeground} />
              </Pressable>
            )})}
            {!subscription.isLoading && packages.length === 0 ? <Text style={styles.purchaseMessage}>Plans are temporarily unavailable. Please try again shortly.</Text> : null}
          </View>
          {pendingPurchase ? (
            <View style={styles.purchaseConfirmCard}>
              <Text style={styles.purchaseConfirmTitle}>Confirm {pendingPurchase.identifier === PREMIUM_PRODUCT_IDS.yearly ? 'yearly' : pendingPurchase.identifier === PREMIUM_PRODUCT_IDS.lifetime ? 'lifetime' : 'monthly'} Premium</Text>
              <Text style={styles.purchaseConfirmText}>{pendingPurchase.identifier === PREMIUM_PRODUCT_IDS.lifetime
                ? `You’ll purchase permanent Babes Rising Premium access for ${pendingPurchase.product.priceString} as a one-time purchase.`
                : freeTrialLabel(pendingPurchase)
                  ? `Start your ${freeTrialLabel(pendingPurchase)}. After the trial, Babes Rising Premium renews for ${pendingPurchase.product.priceString} per ${pendingPurchase.identifier === PREMIUM_PRODUCT_IDS.yearly ? 'year' : 'month'} unless canceled.`
                  : `You’ll purchase Babes Rising Premium for ${pendingPurchase.product.priceString} per ${pendingPurchase.identifier === PREMIUM_PRODUCT_IDS.yearly ? 'year' : 'month'}. Your App Store account manages renewal and cancellation.`}</Text>
              <View style={styles.purchaseConfirmActions}>
                <Pressable disabled={subscription.isPurchasing} onPress={() => setPendingPurchase(null)} style={styles.deleteCancelButton}><Text style={styles.deleteCancelButtonText}>Cancel</Text></Pressable>
                <Pressable disabled={subscription.isPurchasing} onPress={() => void confirmPurchase()} style={styles.purchaseConfirmButton}>
                  {subscription.isPurchasing ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.purchaseConfirmButtonText}>Subscribe</Text>}
                </Pressable>
              </View>
            </View>
          ) : null}
          <View style={styles.featureList}>
            {['Unlimited assessments', 'Unlimited private journal entries', 'Unlimited dating files', 'Unlimited dating-profile reads', 'Pattern tracking over time'].map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <Feather name="check" size={16} color={colors.primary} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>
          <Pressable onPress={() => void goTo('home')} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>Continue free</Text>
          </Pressable>
          <Pressable disabled={subscription.isRestoring} onPress={() => void restorePurchases()} style={({ pressed }) => [styles.restoreButton, pressed && styles.pressed]}>
            <Text style={styles.restoreButtonText}>{subscription.isRestoring ? 'Restoring…' : 'Restore Purchases'}</Text>
          </Pressable>
          {purchaseMessage ? <Text style={styles.purchaseMessage}>{purchaseMessage}</Text> : null}
          <Text style={styles.purchaseNote}>Monthly and yearly subscriptions renew automatically unless canceled at least 24 hours before the end of the current period. Lifetime is a one-time purchase. Manage subscriptions in your App Store account.</Text>
        </ScrollView>
      </View>
    );
  }

  if (screen === 'dating-tracker') {
    return (
      <View style={styles.root}>
        {screenHeader('Dating files', 'Save one private checklist for each person you are dating.')}
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 30) }]} showsVerticalScrollIndicator={false}>
          <View style={styles.trackerIntro}>
            <View style={styles.trackerIntroIcon}><Feather name="folder" size={22} color={colors.primary} /></View>
            <Text style={styles.trackerIntroTitle}>Create a named file</Text>
            <Text style={styles.trackerIntroText}>Each file keeps that person’s positive qualities, definite no’s, and date notes together on this device.</Text>
            <View style={styles.trackerCreateRow}>
              <TextInput
                value={newDatingName}
                onChangeText={setNewDatingName}
                placeholder="His name"
                placeholderTextColor={colors.mutedForeground}
                style={styles.trackerNameInput}
                returnKeyType="done"
                onSubmitEditing={createDatingFile}
              />
              <Pressable onPress={createDatingFile} accessibilityRole="button" accessibilityLabel="Create dating file" style={({ pressed }) => [styles.trackerAddButton, pressed && styles.pressed]}>
                <Feather name="plus" size={20} color={colors.primaryForeground} />
              </Pressable>
            </View>
          </View>

          <View style={styles.trackerSectionHeading}>
            <Text style={styles.trackerSectionTitle}>Saved files</Text>
            <Text style={styles.trackerSectionCount}>{datingFiles.length}</Text>
          </View>
          {datingFiles.length === 0 ? (
            <View style={styles.trackerEmpty}>
              <Feather name="folder-plus" size={25} color={colors.primary} />
              <Text style={styles.trackerEmptyTitle}>No dating files yet</Text>
              <Text style={styles.trackerEmptyText}>Add a name above to start a checklist you can return to after each date.</Text>
            </View>
          ) : datingFiles.map((file) => {
            const positiveCount = file.positiveTraits.filter((item) => item.selected).length;
            const noCount = file.noTraits.filter((item) => item.selected).length;
            return (
              <Pressable
                key={file.id}
                onPress={() => { setSelectedDatingFileId(file.id); setScreen('dating-file'); }}
                style={({ pressed }) => [styles.datingFileCard, pressed && styles.pressed]}
              >
                <View style={styles.datingFileIcon}><Feather name="user" size={19} color={colors.primary} /></View>
                <View style={styles.datingFileCopy}>
                  <View style={styles.datingFileNameRow}>
                    <Text style={styles.datingFileName}>{file.name}</Text>
                    {file.stoppedDating ? <Text style={styles.stoppedPill}>Stopped</Text> : null}
                  </View>
                  <Text style={styles.datingFileMeta}>{positiveCount} positive · {noCount} definite no · {file.dateNotes.length} {file.dateNotes.length === 1 ? 'note' : 'notes'}</Text>
                </View>
                <Feather name="chevron-right" size={19} color={colors.primary} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  if (screen === 'dating-file' && selectedDatingFile) {
    return (
      <View style={styles.root}>
        {screenHeader(selectedDatingFile.name, 'Private dating checklist and notes', 'dating-tracker')}
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 34) }]} showsVerticalScrollIndicator={false}>
          <View style={styles.fileSummary}>
            <View>
              <Text style={styles.fileSummaryKicker}>DATING FILE</Text>
              <Text style={styles.fileSummaryName}>{selectedDatingFile.name}</Text>
              <Text style={styles.fileSummaryDate}>Started {formatDate(selectedDatingFile.createdAt)}</Text>
            </View>
            <View style={[styles.fileStatus, selectedDatingFile.stoppedDating && styles.fileStatusStopped]}>
              <Text style={[styles.fileStatusText, selectedDatingFile.stoppedDating && styles.fileStatusTextStopped]}>{selectedDatingFile.stoppedDating ? 'Stopped dating' : 'Currently dating'}</Text>
            </View>
          </View>

          <TrackerChecklist
            title="Positive qualities"
            subtitle="Check the qualities you actually observe—not just what was promised."
            icon="heart"
            items={selectedDatingFile.positiveTraits}
            inputValue={newPositiveTrait}
            inputPlaceholder="Add a positive quality"
            onInputChange={setNewPositiveTrait}
            onAdd={() => addTrackerItem('positive')}
            onToggle={(id) => toggleTrackerItem('positive', id)}
            onRemove={(id) => removeTrackerItem('positive', id)}
            styles={styles}
            colors={colors}
          />
          <TrackerChecklist
            title="Definite no’s & non-negotiables"
            subtitle="Check anything that crosses a line for you."
            icon="slash"
            items={selectedDatingFile.noTraits}
            inputValue={newNoTrait}
            inputPlaceholder="Add a definite no"
            onInputChange={setNewNoTrait}
            onAdd={() => addTrackerItem('no')}
            onToggle={(id) => toggleTrackerItem('no', id)}
            onRemove={(id) => removeTrackerItem('no', id)}
            styles={styles}
            colors={colors}
          />

          <View style={styles.dateNotesCard}>
            <View style={styles.trackerCardHeading}>
              <View style={styles.trackerCardIcon}><Feather name="calendar" size={16} color={colors.primary} /></View>
              <View style={styles.trackerCardHeadingCopy}>
                <Text style={styles.trackerCardTitle}>Date notes</Text>
                <Text style={styles.trackerCardSubtitle}>Add a short note after each date so details do not blur together.</Text>
              </View>
            </View>
            {selectedDatingFile.dateNotes.map((note) => (
              <View key={note.id} style={styles.dateNote}>
                <View style={styles.dateNoteTop}>
                  <Text style={styles.dateNoteLabel}>{note.label}</Text>
                  <Text style={styles.dateNoteDate}>{formatDate(note.createdAt)}</Text>
                </View>
                <Text style={styles.dateNoteText}>{note.notes}</Text>
              </View>
            ))}
            <TextInput
              value={newDateLabel}
              onChangeText={setNewDateLabel}
              placeholder={`Date ${selectedDatingFile.dateNotes.length + 1} title (optional)`}
              placeholderTextColor={colors.mutedForeground}
              style={styles.textInput}
            />
            <TextInput
              value={newDateNotes}
              onChangeText={setNewDateNotes}
              placeholder="What happened? How did you feel? What do you want to remember?"
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={styles.textArea}
            />
            <Pressable onPress={addDateNote} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Feather name="plus" size={17} color={colors.secondaryForeground} />
              <Text style={styles.secondaryButtonText}>Save date note</Text>
            </Pressable>
          </View>

          <View style={styles.closureCard}>
            <View style={styles.trackerCardHeading}>
              <View style={styles.trackerCardIcon}><Feather name="bookmark" size={16} color={colors.primary} /></View>
              <View style={styles.trackerCardHeadingCopy}>
                <Text style={styles.trackerCardTitle}>Why I stopped—or what I need to remember</Text>
                <Text style={styles.trackerCardSubtitle}>Keep the reason clear for your future self.</Text>
              </View>
            </View>
            <TextInput
              value={selectedDatingFile.closureNote}
              onChangeText={(value) => saveClosureNote(selectedDatingFile.stoppedDating, value)}
              placeholder="Write the reason, boundary, or reminder here"
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={styles.textArea}
            />
            <Pressable
              onPress={() => saveClosureNote(!selectedDatingFile.stoppedDating, selectedDatingFile.closureNote)}
              style={({ pressed }) => [selectedDatingFile.stoppedDating ? styles.secondaryButton : styles.primaryButton, pressed && styles.pressed]}
            >
              <Feather name={selectedDatingFile.stoppedDating ? 'rotate-ccw' : 'x-circle'} size={17} color={selectedDatingFile.stoppedDating ? colors.secondaryForeground : colors.primaryForeground} />
              <Text style={selectedDatingFile.stoppedDating ? styles.secondaryButtonText : styles.primaryButtonText}>{selectedDatingFile.stoppedDating ? 'Mark as currently dating' : 'Mark as stopped dating'}</Text>
            </Pressable>
          </View>

          <View style={styles.readerPrivacy}>
            <Feather name="lock" size={16} color={colors.primary} />
            <Text style={styles.readerPrivacyText}>This file is saved locally on this device. The checklist supports your judgment; it does not diagnose another person.</Text>
          </View>
          <Pressable
            onPress={() => deleteDatingFile(selectedDatingFile)}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${selectedDatingFile.name} dating file`}
            style={({ pressed }) => [styles.deleteFileButton, pressed && styles.pressed]}
          >
            <Feather name="trash-2" size={17} color={colors.destructive} />
            <Text style={styles.deleteFileButtonText}>Delete this file</Text>
          </Pressable>
          {deleteConfirmFileId === selectedDatingFile.id ? (
            <View style={styles.deleteConfirmCard}>
              <View style={styles.deleteConfirmHeading}>
                <Feather name="alert-triangle" size={19} color={colors.destructive} />
                <Text style={styles.deleteConfirmTitle}>Delete {selectedDatingFile.name}’s file?</Text>
              </View>
              <Text style={styles.deleteConfirmText}>This permanently removes the checklists, personalized qualities, and every saved date note from this device.</Text>
              <View style={styles.deleteConfirmActions}>
                <Pressable onPress={() => setDeleteConfirmFileId(null)} style={({ pressed }) => [styles.deleteCancelButton, pressed && styles.pressed]}>
                  <Text style={styles.deleteCancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => confirmDeleteDatingFile(selectedDatingFile)} style={({ pressed }) => [styles.deleteConfirmButton, pressed && styles.pressed]}>
                  <Feather name="trash-2" size={16} color={colors.destructiveForeground} />
                  <Text style={styles.deleteConfirmButtonText}>Delete permanently</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  if (screen === 'profile-reader') {
    return (
      <View style={styles.root}>
        {screenHeader('Read a dating profile', 'Notice what is written before you decide whether to meet.')}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.readerIntro}>
            <View style={styles.readerIntroIcon}><Feather name="camera" size={22} color={colors.primary} /></View>
            <Text style={styles.readerIntroTitle}>A profile is a starting point, not proof.</Text>
            <Text style={styles.readerIntroText}>Capture a screenshot or take a photo of the visible profile text. Babes Rising will summarize what is stated and suggest questions—without trying to decide who someone is.</Text>
          </View>
          <View style={styles.readerActions}>
            <Pressable onPress={() => void readProfileImage('camera')} accessibilityRole="button" style={({ pressed }) => [styles.readerAction, pressed && styles.pressed]}>
              <View style={styles.readerActionIcon}><Feather name="camera" size={21} color={colors.primary} /></View>
              <View style={styles.readerActionCopy}>
                <Text style={styles.readerActionTitle}>Scan with camera</Text>
                <Text style={styles.readerActionText}>{cameraGranted ? 'Take a clear photo of the profile' : 'Camera permission will be requested'}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
            <Pressable onPress={() => void readProfileImage('library')} accessibilityRole="button" style={({ pressed }) => [styles.readerAction, pressed && styles.pressed]}>
              <View style={styles.readerActionIcon}><Feather name="image" size={21} color={colors.primary} /></View>
              <View style={styles.readerActionCopy}>
                <Text style={styles.readerActionTitle}>Choose a screenshot</Text>
                <Text style={styles.readerActionText}>Use an image already saved on your phone</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
          {profileImage ? (
            <View style={styles.scanStatus}>
              <Feather name={profileReader.isPending ? 'loader' : profileAnalysis ? 'check-circle' : 'image'} size={18} color={colors.primary} />
              <Text style={styles.scanStatusText}>{profileReader.isPending ? 'Reading the visible profile text…' : profileAnalysis ? 'Profile read complete' : 'Profile image ready'}</Text>
            </View>
          ) : null}
          {profileReader.isPending ? (
            <View style={styles.readerLoading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.readerLoadingTitle}>Looking closely at the words</Text>
              <Text style={styles.readerLoadingText}>The image is being processed for this analysis and is not saved by Babes Rising.</Text>
            </View>
          ) : null}
          {profileError ? (
            <View style={styles.readerError}>
              <Feather name="alert-circle" size={18} color={colors.destructive} />
              <Text style={styles.readerErrorText}>{profileError}</Text>
            </View>
          ) : null}
          {profileAnalysis ? (
            <View style={styles.analysisStack}>
              <View style={styles.analysisHero}>
                <View style={styles.analysisHeroTop}>
                  <View style={styles.analysisBadge}><Feather name="eye" size={14} color={colors.primary} /><Text style={styles.analysisBadgeText}>VISIBLE CONTENT</Text></View>
                  <Text style={styles.confidenceText}>{profileAnalysis.confidence} confidence</Text>
                </View>
                <Text style={styles.analysisSummary}>{profileAnalysis.summary}</Text>
              </View>
              <AnalysisList title="Possible patterns to notice" icon="flag" items={profileAnalysis.possiblePatterns} styles={styles} colors={colors} emptyText="No specific pattern stood out from the visible text." />
              <AnalysisList title="Positive signals in the profile" icon="sun" items={profileAnalysis.positiveSignals} styles={styles} colors={colors} emptyText="The profile did not provide enough visible detail to name a positive signal." />
              <AnalysisList title="Questions to consider" icon="help-circle" items={profileAnalysis.questionsToConsider} styles={styles} colors={colors} emptyText="Ask open questions and notice whether the answers feel respectful." />
              <View style={styles.profileSafetyNote}>
                <Feather name="shield" size={18} color={colors.secondaryForeground} />
                <Text style={styles.profileSafetyText}>{profileAnalysis.safetyNote}</Text>
              </View>
              <Pressable onPress={() => { setProfileAnalysis(null); setProfileImage(null); }} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Feather name="refresh-cw" size={17} color={colors.secondaryForeground} />
                <Text style={styles.secondaryButtonText}>Read another profile</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.readerPrivacy}>
            <Feather name="lock" size={16} color={colors.primary} />
            <Text style={styles.readerPrivacyText}>Only the selected image is sent for this one analysis. Babes Rising does not save the image or identify the person.</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.homeContent, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 30) }]} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <View style={styles.brandLockup}>
            <View style={styles.brandIcon}><Feather name="flag" size={17} color={colors.primaryForeground} /></View>
            <Text style={styles.brandText}>BABES RISING</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open privacy information" onPress={() => Alert.alert('Private by design', 'This MVP stores your journal and assessment history locally on this device. Cloud sync is not enabled.')} style={styles.privacyButton}>
            <Feather name="shield" size={17} color={colors.secondaryForeground} />
            <Text style={styles.privacyButtonText}>Private</Text>
          </Pressable>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>See the pattern. Trust yourself. Know your worth. Rise.</Text>
          <Text style={styles.heroTitle}>Know what you’re experiencing.</Text>
          <Text style={styles.heroBody}>Understand relationship patterns, reflect on what’s happening, and privately keep a record.</Text>
        </View>
        <LinearGradient colors={[colors.accent, colors.card]} style={styles.heroPanel}>
          <View style={styles.heroOrbLarge} />
          <View style={styles.heroOrbSmall} />
          <Feather name="compass" size={34} color={colors.primary} />
          <Text style={styles.heroPanelTitle}>Your experience is worth asking about.</Text>
          <Text style={styles.heroPanelText}>Start with one situation. Answer at your own pace. Look for patterns—not labels.</Text>
        </LinearGradient>
        <Pressable accessibilityRole="button" accessibilityLabel="Check a situation" onPress={() => void goTo('categories')} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Feather name="search" size={18} color={colors.primaryForeground} />
          <Text style={styles.primaryButtonText}>Check a situation</Text>
          <Feather name="arrow-up-right" size={18} color={colors.primaryForeground} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Document what happened" onPress={() => openNewEntry()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Feather name="edit-3" size={18} color={colors.secondaryForeground} />
          <Text style={styles.secondaryButtonText}>Document what happened</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Read a dating profile" onPress={openProfileReader} style={({ pressed }) => [styles.readerHomeButton, pressed && styles.pressed]}>
          <View style={styles.readerHomeIcon}><Feather name="camera" size={18} color={colors.primary} /></View>
          <View style={styles.readerHomeCopy}>
            <Text style={styles.readerHomeTitle}>Read a dating profile</Text>
            <Text style={styles.readerHomeText}>Scan visible text and prepare better questions before a date</Text>
          </View>
          <Feather name="arrow-up-right" size={17} color={colors.primary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open dating tracker" onPress={() => void goTo('dating-tracker')} style={({ pressed }) => [styles.readerHomeButton, pressed && styles.pressed]}>
          <View style={styles.readerHomeIcon}><Feather name="check-square" size={18} color={colors.primary} /></View>
          <View style={styles.readerHomeCopy}>
            <Text style={styles.readerHomeTitle}>Dating tracker</Text>
            <Text style={styles.readerHomeText}>Save a named checklist and notes for each person</Text>
          </View>
          <Feather name="arrow-up-right" size={17} color={colors.primary} />
        </Pressable>
        <View style={styles.homeStats}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{entries.length}</Text>
            <Text style={styles.statLabel}>journal {entries.length === 1 ? 'entry' : 'entries'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{assessments.length}</Text>
            <Text style={styles.statLabel}>assessments</Text>
          </View>
          <Pressable onPress={() => void goTo('journal')} style={styles.timelineLink}>
            <Text style={styles.timelineLinkText}>Open timeline</Text>
            <Feather name="arrow-right" size={15} color={colors.primary} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open Premium plans" onPress={() => void goTo('premium')} style={({ pressed }) => [styles.premiumHomeButton, pressed && styles.pressed]}>
          <View style={styles.readerHomeIcon}><Feather name={isPremium ? 'check-circle' : 'star'} size={18} color={colors.primary} /></View>
          <View style={styles.readerHomeCopy}>
            <Text style={styles.readerHomeTitle}>{isPremium ? 'Premium active' : 'Babes Rising Premium'}</Text>
            <Text style={styles.readerHomeText}>{isPremium ? 'Your unlimited access is active' : 'View monthly and yearly plans'}</Text>
          </View>
          <Feather name="arrow-up-right" size={17} color={colors.primary} />
        </Pressable>
        <View style={styles.homeFooter}>
          <Feather name="info" size={15} color={colors.mutedForeground} />
          <Text style={styles.homeFooterText}>Babes Rising is educational and reflective. It does not diagnose mental health conditions, determine whether someone is an abuser, or replace professional, legal, or emergency support.</Text>
        </View>
        <Text style={styles.developerCredit}>Developed by Babes Inc.</Text>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    homeContent: { paddingHorizontal: 22, gap: 14 },
    screenHeader: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingBottom: 16, gap: 13 },
    headerCopy: { flex: 1, gap: 2 },
    eyebrow: { color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.6 },
    screenTitle: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 27, lineHeight: 32, letterSpacing: -0.5 },
    screenSubtitle: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, marginTop: 4 },
    iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    brandIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    brandText: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 1.4 },
    privacyButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, backgroundColor: colors.secondary },
    privacyButtonText: { color: colors.secondaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    heroCopy: { marginTop: 30, gap: 9 },
    heroKicker: { color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    heroTitle: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 40, lineHeight: 44, letterSpacing: -1.8, maxWidth: 340 },
    heroBody: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24, maxWidth: 345 },
    heroPanel: { minHeight: 182, borderRadius: 27, padding: 23, justifyContent: 'flex-end', overflow: 'hidden', gap: 8, marginTop: 9 },
    heroOrbLarge: { position: 'absolute', width: 175, height: 175, borderRadius: 88, backgroundColor: colors.card, opacity: 0.62, top: -83, right: -44 },
    heroOrbSmall: { position: 'absolute', width: 86, height: 86, borderRadius: 43, backgroundColor: colors.primary, opacity: 0.13, top: 27, right: 45 },
    heroPanelTitle: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20, lineHeight: 25, maxWidth: 275 },
    heroPanelText: { color: colors.secondaryForeground, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, maxWidth: 315 },
    primaryButton: { minHeight: 56, borderRadius: 18, paddingHorizontal: 19, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 4 },
    primaryButtonText: { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
    secondaryButton: { minHeight: 54, borderRadius: 18, paddingHorizontal: 18, backgroundColor: colors.secondary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1, borderColor: colors.border },
    secondaryButtonText: { color: colors.secondaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
    disabledButton: { opacity: 0.45 },
    pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
    homeStats: { flexDirection: 'row', alignItems: 'center', marginTop: 18, paddingVertical: 17, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
    statItem: { gap: 1, minWidth: 70 },
    statNumber: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 21 },
    statLabel: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11 },
    statDivider: { height: 31, width: 1, backgroundColor: colors.border, marginHorizontal: 14 },
    timelineLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto' },
    timelineLinkText: { color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    homeFooter: { flexDirection: 'row', gap: 9, paddingVertical: 10 },
    homeFooterText: { flex: 1, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
    developerCredit: { color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 11, textAlign: 'center', paddingBottom: 8 },
    premiumHomeButton: { minHeight: 68, borderRadius: 18, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.accent, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 28, gap: 15 },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 11 },
    categoryCard: { width: '48.2%', minHeight: 149, padding: 15, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 8 },
    categoryCardSelected: { borderColor: colors.primary, backgroundColor: colors.accent },
    categoryIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
    categoryIconSelected: { backgroundColor: colors.primary },
    categoryLabel: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 18 },
    categoryDescription: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15 },
    disclaimer: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 14, marginTop: 3 },
    assessmentTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, gap: 10 },
    progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.muted },
    progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
    progressText: { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12, minWidth: 28, textAlign: 'right' },
    assessmentContent: { paddingHorizontal: 22, paddingTop: 32, paddingBottom: 22 },
    assessmentMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 23 },
    tinyPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 14 },
    tinyPillText: { color: colors.accentForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
    questionKicker: { color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 12 },
    questionText: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 29, lineHeight: 35, letterSpacing: -0.7 },
    questionHint: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 14 },
    answerList: { gap: 10, marginTop: 29 },
    answerRow: { minHeight: 58, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
    answerRowSelected: { borderColor: colors.primary, backgroundColor: colors.accent },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.input, alignItems: 'center', justifyContent: 'center' },
    radioSelected: { borderColor: colors.primary },
    radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
    answerText: { color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 15 },
    answerTextSelected: { color: colors.accentForeground, fontFamily: 'Inter_600SemiBold' },
    bottomAction: { paddingHorizontal: 20, paddingTop: 8, backgroundColor: colors.background },
    resultHero: { borderRadius: 25, padding: 22, gap: 9, overflow: 'hidden' },
    resultIcon: { width: 49, height: 49, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    resultTone: { color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 4 },
    resultPattern: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 27, lineHeight: 32 },
    resultExplanation: { color: colors.secondaryForeground, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
    reflectionCard: { backgroundColor: colors.card, borderRadius: 21, borderWidth: 1, borderColor: colors.border, padding: 19, gap: 13 },
    cardEyebrow: { color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3 },
    reflectionRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    reflectionText: { flex: 1, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 19 },
    safetyNote: { flexDirection: 'row', gap: 10, borderRadius: 17, backgroundColor: colors.secondary, padding: 15, alignItems: 'flex-start' },
    safetyText: { flex: 1, color: colors.secondaryForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
    resultDate: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, textAlign: 'center', marginTop: 2 },
    journalToolbar: { gap: 11, paddingHorizontal: 20, paddingBottom: 9 },
    searchBox: { height: 47, borderRadius: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 9 },
    searchInput: { flex: 1, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14, paddingVertical: 0 },
    filterRow: { gap: 7, paddingVertical: 2 },
    filterPill: { borderRadius: 15, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.muted },
    filterPillSelected: { backgroundColor: colors.primary },
    filterText: { color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 11 },
    filterTextSelected: { color: colors.primaryForeground },
    listContent: { paddingHorizontal: 20, paddingTop: 4, gap: 11 },
    entryCard: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 17, gap: 9 },
    entryCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    entryTag: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 5, paddingHorizontal: 9 },
    entryTagText: { color: colors.accentForeground, fontFamily: 'Inter_600SemiBold', fontSize: 10 },
    entryDate: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11 },
    entryTitle: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 22 },
    entryPreview: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
    entryHint: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 1 },
    floatingButton: { position: 'absolute', right: 22, width: 55, height: 55, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.foreground, shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
    emptyState: { alignItems: 'center', paddingHorizontal: 22, paddingTop: 55, gap: 10 },
    emptyIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 },
    emptyText: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300, marginBottom: 7 },
    formContent: { paddingHorizontal: 20, gap: 8 },
    formLabel: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 8 },
    requiredMark: { color: colors.primary },
    optionalMark: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11 },
    textInput: { minHeight: 49, borderRadius: 15, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.card, paddingHorizontal: 14, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 },
    textArea: { minHeight: 96, borderRadius: 15, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.card, paddingHorizontal: 14, paddingTop: 13, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, textAlignVertical: 'top' },
    textAreaLarge: { minHeight: 130 },
    textAreaSmall: { minHeight: 105, borderRadius: 15, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.card, paddingHorizontal: 12, paddingTop: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, textAlignVertical: 'top' },
    formSplit: { flexDirection: 'row', gap: 9 },
    formHalf: { flex: 1, gap: 8 },
    privateCallout: { flexDirection: 'row', gap: 10, backgroundColor: colors.secondary, borderRadius: 16, padding: 14, alignItems: 'flex-start', marginTop: 9, marginBottom: 5 },
    privateCalloutText: { flex: 1, color: colors.secondaryForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17 },
    premiumHero: { borderRadius: 25, padding: 22, gap: 10, minHeight: 170, justifyContent: 'flex-end' },
    premiumMark: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 'auto' },
    premiumTitle: { color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 26, lineHeight: 31, maxWidth: 280 },
    premiumBody: { color: colors.primaryForeground, opacity: 0.82, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, maxWidth: 310 },
    planList: { gap: 9 },
    planCard: { minHeight: 70, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    planCardFeatured: { borderColor: colors.primary, backgroundColor: colors.accent },
    planName: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
    trialText: { color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 3, textTransform: 'capitalize' },
    planPrice: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
    purchaseConfirmCard: { borderRadius: 18, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card, padding: 16, gap: 10 },
    purchaseConfirmTitle: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 },
    purchaseConfirmText: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
    purchaseConfirmActions: { flexDirection: 'row', gap: 9 },
    purchaseConfirmButton: { flex: 1.5, minHeight: 46, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    purchaseConfirmButtonText: { color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 13 },
    restoreButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    restoreButtonText: { color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
    purchaseMessage: { color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, textAlign: 'center' },
    featureList: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 19, padding: 17, gap: 13 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    featureText: { color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 13 },
    purchaseNote: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 14 },
    trackerIntro: { backgroundColor: colors.accent, borderRadius: 22, padding: 18, gap: 9 },
    trackerIntroIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    trackerIntroTitle: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20, lineHeight: 25 },
    trackerIntroText: { color: colors.secondaryForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
    trackerCreateRow: { flexDirection: 'row', gap: 9, marginTop: 5 },
    trackerNameInput: { flex: 1, height: 50, borderRadius: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.input, paddingHorizontal: 14, color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 14 },
    trackerAddButton: { width: 50, height: 50, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    trackerSectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 },
    trackerSectionTitle: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17 },
    trackerSectionCount: { minWidth: 27, height: 27, borderRadius: 14, backgroundColor: colors.secondary, color: colors.secondaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12, textAlign: 'center', lineHeight: 27 },
    trackerEmpty: { alignItems: 'center', backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 25, gap: 8 },
    trackerEmptyTitle: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17 },
    trackerEmptyText: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center' },
    datingFileCard: { minHeight: 78, borderRadius: 19, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    datingFileIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    datingFileCopy: { flex: 1, gap: 5 },
    datingFileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    datingFileName: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 },
    datingFileMeta: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
    stoppedPill: { color: colors.primaryForeground, backgroundColor: colors.destructive, borderRadius: 9, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, fontFamily: 'Inter_600SemiBold', fontSize: 9 },
    fileSummary: { backgroundColor: colors.primary, borderRadius: 22, padding: 19, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    fileSummaryKicker: { color: colors.primaryForeground, opacity: 0.72, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
    fileSummaryName: { color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 25, lineHeight: 31, marginTop: 4 },
    fileSummaryDate: { color: colors.primaryForeground, opacity: 0.8, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
    fileStatus: { backgroundColor: colors.card, borderRadius: 11, paddingVertical: 6, paddingHorizontal: 9 },
    fileStatusStopped: { backgroundColor: colors.destructive },
    fileStatusText: { color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 9 },
    fileStatusTextStopped: { color: colors.destructiveForeground },
    trackerCard: { backgroundColor: colors.card, borderRadius: 21, borderWidth: 1, borderColor: colors.border, padding: 17, gap: 12 },
    trackerCardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    trackerCardIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    trackerCardHeadingCopy: { flex: 1, gap: 3 },
    trackerCardTitle: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16, lineHeight: 21 },
    trackerCardSubtitle: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
    trackerCountText: { color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11 },
    trackerItem: { minHeight: 47, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
    trackerItemSelected: { borderColor: colors.primary, backgroundColor: colors.accent },
    trackerCheckbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.input, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
    trackerCheckboxSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
    trackerItemLabel: { flex: 1, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
    trackerItemLabelSelected: { color: colors.accentForeground, fontFamily: 'Inter_600SemiBold' },
    trackerCustomBadge: { color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.6 },
    trackerInputRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
    trackerTraitInput: { flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.background, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 12 },
    trackerTraitAdd: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
    dateNotesCard: { backgroundColor: colors.card, borderRadius: 21, borderWidth: 1, borderColor: colors.border, padding: 17, gap: 12 },
    dateNote: { backgroundColor: colors.background, borderRadius: 15, padding: 13, gap: 6, borderWidth: 1, borderColor: colors.border },
    dateNoteTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    dateNoteLabel: { flex: 1, color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
    dateNoteDate: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 9 },
    dateNoteText: { color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
    closureCard: { backgroundColor: colors.card, borderRadius: 21, borderWidth: 1, borderColor: colors.border, padding: 17, gap: 12 },
    deleteFileButton: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: colors.destructive, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    deleteFileButtonText: { color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
    deleteConfirmCard: { borderRadius: 18, borderWidth: 1, borderColor: colors.destructive, backgroundColor: colors.card, padding: 16, gap: 11 },
    deleteConfirmHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    deleteConfirmTitle: { flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 },
    deleteConfirmText: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
    deleteConfirmActions: { flexDirection: 'row', gap: 9 },
    deleteCancelButton: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
    deleteCancelButtonText: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    deleteConfirmButton: { flex: 1.5, minHeight: 46, borderRadius: 14, backgroundColor: colors.destructive, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    deleteConfirmButtonText: { color: colors.destructiveForeground, fontFamily: 'Inter_700Bold', fontSize: 12 },
    readerIntro: { backgroundColor: colors.accent, borderRadius: 22, padding: 18, gap: 9 },
    readerIntroIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
    readerIntroTitle: { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20, lineHeight: 25 },
    readerIntroText: { color: colors.secondaryForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
    readerActions: { gap: 10 },
    readerAction: { minHeight: 78, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 19, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    readerActionIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    readerActionCopy: { flex: 1, gap: 3 },
    readerActionTitle: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    readerActionText: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
    scanStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.secondary, padding: 13, borderRadius: 15 },
    scanStatusText: { color: colors.secondaryForeground, fontFamily: 'Inter_500Medium', fontSize: 12 },
    readerLoading: { alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 19, padding: 21, gap: 8 },
    readerLoadingTitle: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
    readerLoadingText: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, textAlign: 'center' },
    readerError: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: colors.accent, borderRadius: 15, padding: 13 },
    readerErrorText: { flex: 1, color: colors.accentForeground, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
    analysisStack: { gap: 12 },
    analysisHero: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 17, gap: 12 },
    analysisHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    analysisBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8 },
    analysisBadgeText: { color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8 },
    confidenceText: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10 },
    analysisSummary: { color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22 },
    analysisCard: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 17, gap: 12 },
    analysisCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    analysisCardIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    analysisCardTitle: { flex: 1, color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    analysisItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    analysisItemBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 7 },
    analysisItemText: { flex: 1, color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
    analysisEmptyText: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
    profileSafetyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.secondary, borderRadius: 17, padding: 15 },
    profileSafetyText: { flex: 1, color: colors.secondaryForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
    readerPrivacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingHorizontal: 4, paddingVertical: 6 },
    readerPrivacyText: { flex: 1, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
    readerHomeButton: { minHeight: 74, borderRadius: 19, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
    readerHomeIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    readerHomeCopy: { flex: 1, gap: 3 },
    readerHomeTitle: { color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    readerHomeText: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  });
}

function TrackerChecklist({
  title,
  subtitle,
  icon,
  items,
  inputValue,
  inputPlaceholder,
  onInputChange,
  onAdd,
  onToggle,
  onRemove,
  styles,
  colors,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  items: TrackerItem[];
  inputValue: string;
  inputPlaceholder: string;
  onInputChange: (value: string) => void;
  onAdd: () => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useColors>;
}) {
  const selectedCount = items.filter((item) => item.selected).length;
  return (
    <View style={styles.trackerCard}>
      <View style={styles.trackerCardHeading}>
        <View style={styles.trackerCardIcon}><Feather name={icon} size={16} color={colors.primary} /></View>
        <View style={styles.trackerCardHeadingCopy}>
          <Text style={styles.trackerCardTitle}>{title}</Text>
          <Text style={styles.trackerCardSubtitle}>{subtitle}</Text>
        </View>
        <Text style={styles.trackerCountText}>{selectedCount}</Text>
      </View>
      {items.map((item) => (
        <Pressable key={item.id} onPress={() => onToggle(item.id)} style={[styles.trackerItem, item.selected && styles.trackerItemSelected]}>
          <View style={[styles.trackerCheckbox, item.selected && styles.trackerCheckboxSelected]}>
            {item.selected ? <Feather name="check" size={14} color={colors.primaryForeground} /> : null}
          </View>
          <Text style={[styles.trackerItemLabel, item.selected && styles.trackerItemLabelSelected]}>{item.label}</Text>
          {item.custom ? (
            <Pressable onPress={() => onRemove(item.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${item.label}`}>
              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </Pressable>
      ))}
      <View style={styles.trackerInputRow}>
        <TextInput
          value={inputValue}
          onChangeText={onInputChange}
          placeholder={inputPlaceholder}
          placeholderTextColor={colors.mutedForeground}
          style={styles.trackerTraitInput}
          returnKeyType="done"
          onSubmitEditing={onAdd}
        />
        <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={inputPlaceholder} style={({ pressed }) => [styles.trackerTraitAdd, pressed && styles.pressed]}>
          <Feather name="plus" size={18} color={colors.secondaryForeground} />
        </Pressable>
      </View>
    </View>
  );
}

function AnalysisList({
  title,
  icon,
  items,
  styles,
  colors,
  emptyText,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  items: string[];
  styles: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useColors>;
  emptyText: string;
}) {
  return (
    <View style={styles.analysisCard}>
      <View style={styles.analysisCardTitleRow}>
        <View style={styles.analysisCardIcon}><Feather name={icon} size={15} color={colors.primary} /></View>
        <Text style={styles.analysisCardTitle}>{title}</Text>
      </View>
      {items.length > 0 ? items.map((item) => (
        <View key={item} style={styles.analysisItem}>
          <View style={styles.analysisItemBullet} />
          <Text style={styles.analysisItemText}>{item}</Text>
        </View>
      )) : <Text style={styles.analysisEmptyText}>{emptyText}</Text>}
    </View>
  );
}