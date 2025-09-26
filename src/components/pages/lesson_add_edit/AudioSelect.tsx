'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTRPC, useTRPCClient } from '~/api/client';
import { atom, useAtom, useAtomValue } from 'jotai';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Card, CardContent } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { IoMdArrowDropleft, IoMdArrowDropright } from 'react-icons/io';
import { IoAddOutline } from 'react-icons/io5';
import { MdMic, MdPlayArrow, MdStop, MdCloudUpload, MdRefresh } from 'react-icons/md';
import { FaRobot } from 'react-icons/fa';
import { HiOutlineSparkles } from 'react-icons/hi';
import ms from 'ms';
import { cn } from '~/lib/utils';
import {
  base_word_script_id_atom,
  lang_id_atom,
  type audio_type,
  type text_lesson_word_type
} from './lesson_add_edit_state';
import {
  get_lang_from_id,
  get_script_from_id,
  lang_list_obj,
  LANG_LIST,
  type lang_list_type
} from '~/state/lang_list';
import { lipi_parivartak } from '~/tools/lipi_lekhika';

type Props = {
  onAudioSelect: (audio: audio_type) => void;
  wordItem: text_lesson_word_type;
};

const selected_audio_atom = atom<audio_type | null>(null);

export default function AudioSelect(props: Props) {
  const [tab, setTab] = useState<'add' | 'make'>('add');
  const [selectedAudio, setSelectedAudio] = useAtom(selected_audio_atom);

  useEffect(() => {
    setSelectedAudio(null);
  }, [props.wordItem]);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
        <TabsList className="flex w-full items-center justify-center">
          <TabsTrigger value="add">Select from Existing</TabsTrigger>
          <TabsTrigger value="make">Create New Audio</TabsTrigger>
        </TabsList>
        <TabsContent value="add">
          <AudioList />
        </TabsContent>
        <TabsContent value="make">
          <AudioCreation {...props} />
        </TabsContent>
      </Tabs>
      <Button
        onClick={() => props.onAudioSelect(selectedAudio!)}
        disabled={!selectedAudio}
        className="text-lg"
        variant="outline"
      >
        <IoAddOutline className="size-6 text-yellow-600 dark:text-yellow-400" /> Add Audio to Word
      </Button>
    </div>
  );
}

const AUDIO_AVERAGE_TIME_MS = ms('7secs');

const AudioList = () => {
  const trpc = useTRPC();
  const [selectedAudio, setSelectedAudio] = useAtom(selected_audio_atom);
  const [searchText, setSearchText] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [langFilter, setLangFilter] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const limit = 12;

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchText]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, langFilter]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const list_q = useQuery(
    trpc.audio_assets.list_audio_assets.queryOptions({
      search_text: debouncedSearch || undefined,
      sort_by: 'created_at',
      order_by: 'desc',
      page,
      limit,
      lang_id: langFilter
    })
  );

  const isLoading = list_q.isLoading || list_q.isFetching;
  const data = list_q.data;
  const items = useMemo(() => data?.list ?? [], [data]);

  const handlePlay = (id: number, s3_key: string) => {
    if (playingId === id) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${s3_key}`);
    audioRef.current = audio as any;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search description..."
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Label className="text-sm font-semibold">Language</Label>
          <Select
            value={langFilter === null ? 'all' : String(langFilter)}
            onValueChange={(v) => setLangFilter(v === 'all' ? null : Number(v))}
          >
            <SelectTrigger size="sm" className="w-28">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {LANG_LIST.map((lang) => (
                <SelectItem key={lang} value={String(lang_list_obj[lang as lang_list_type])}>
                  {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {isLoading
          ? Array.from({ length: limit }).map((_, i) => (
              <Card className="p-2">
                <CardContent className="flex items-start gap-3 p-2">
                  <Skeleton className="h-14 w-14 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-3/5" />
                  </div>
                </CardContent>
              </Card>
            ))
          : items.map((item) => {
              const selected = selectedAudio?.id === item.id;
              return (
                <Card
                  key={item.id}
                  onClick={(e) => {
                    // avoid toggling on play button click
                    if ((e.target as HTMLElement).closest('[data-audio-action]')) return;
                    if (selected) setSelectedAudio(null);
                    else
                      setSelectedAudio({
                        id: item.id,
                        description: item.description,
                        s3_key: item.s3_key
                      });
                  }}
                  className={cn(
                    'p-2 transition duration-200 hover:bg-gray-100 hover:dark:bg-gray-800',
                    selected && 'ring-2 ring-blue-500'
                  )}
                >
                  <CardContent className="flex items-center gap-3 p-2">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs">{item.description}</p>
                      {langFilter === null && item.lang_id != null && (
                        <p className="text-[10px] text-muted-foreground">
                          {get_lang_from_id(item.lang_id)}
                        </p>
                      )}
                    </div>
                    <div data-audio-action>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-xs"
                        onClick={() => handlePlay(item.id, item.s3_key)}
                      >
                        {playingId === item.id ? (
                          <span className="flex items-center gap-1">
                            <MdStop /> Stop
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <MdPlayArrow /> Play
                          </span>
                        )}
                      </Button>
                    </div>
                    <div className="flex size-4 items-center justify-center rounded bg-muted">
                      {item.type === 'ai_generated' ? (
                        <FaRobot className="size-4 text-yellow-600" />
                      ) : (
                        <MdMic className="size-4 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      <div className="mx-auto flex w-full items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {data ? (
            <span>
              Page {data.page} of {data.pageCount} • Total {data.total}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Loading...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!data?.hasPrev || isLoading}
            className="h-8 px-2 text-xs"
          >
            <IoMdArrowDropleft className="mr-1" />
            Prev
          </Button>
          <Button
            variant="secondary"
            onClick={() => setPage((p) => p + 1)}
            disabled={!data?.hasNext || isLoading}
            className="h-8 px-2 text-xs"
          >
            Next
            <IoMdArrowDropright className="ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const VOICE_TYPE_LIST = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer'
] as const;
const DEFAULT_VOICE = 'alloy';

type voice_types = (typeof VOICE_TYPE_LIST)[number];

const AudioCreation = ({ wordItem }: Props) => {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const [, setSelectedAudio] = useAtom(selected_audio_atom);
  const queryClient = useQueryClient();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [tab, setTab] = useState<'ai' | 'record'>('ai');

  useEffect(() => {
    setSelectedAudio(null);
  }, [tab, wordItem]);

  const [langId, setLangId] = useState<number | null>(null);

  const [voice, setVoice] = useState<voice_types>(DEFAULT_VOICE);
  const word_script_id = useAtomValue(base_word_script_id_atom);

  const create_audio_mut = useMutation(
    trpc.audio_assets.upload_audio_asset.mutationOptions({
      onSuccess: (data) => {
        setSelectedAudio({ id: data.id, description: data.description, s3_key: data.s3_key });
        queryClient.invalidateQueries(trpc.audio_assets.list_audio_assets.pathFilter());
      }
    })
  );

  const delete_audio_mut = useMutation(
    trpc.audio_assets.delete_audio_asset.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.audio_assets.list_audio_assets.pathFilter());
        setSelectedAudio(null);
      }
    })
  );

  const createdAudioRef = useRef<HTMLAudioElement | null>(null);
  const [createdPlaying, setCreatedPlaying] = useState(false);

  useEffect(() => {
    return () => {
      if (createdAudioRef.current) {
        createdAudioRef.current.pause();
        createdAudioRef.current = null;
      }
    };
  }, []);

  const handlePlayCreated = (s3_key: string) => {
    if (createdPlaying) {
      if (createdAudioRef.current) createdAudioRef.current.pause();
      setCreatedPlaying(false);
      return;
    }
    if (createdAudioRef.current) {
      createdAudioRef.current.pause();
      createdAudioRef.current = null;
    }
    const audio = new Audio(`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${s3_key}`);
    createdAudioRef.current = audio as any;
    audio.onended = () => setCreatedPlaying(false);
    audio.play();
    setCreatedPlaying(true);
  };

  const lesson_lang_id = useAtomValue(lang_id_atom);
  const handleCreateAudio = async () => {
    const text_key = await lipi_parivartak(
      wordItem.word,
      get_script_from_id(word_script_id),
      'Normal'
    );
    const voice_language = get_lang_from_id(lesson_lang_id); // for prompting the tts model
    create_audio_mut.mutate({
      text: wordItem.word,
      text_key: text_key,
      lang_id: langId,
      voice: voice,
      voice_language
    });
  };

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    if (create_audio_mut.isPending) {
      setElapsedTime(0);
      intervalId = setInterval(() => setElapsedTime((prev) => prev + 100), 100);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [create_audio_mut.isPending]);

  useEffect(() => {
    if (create_audio_mut.isSuccess || create_audio_mut.isError || !create_audio_mut.isPending) {
      setElapsedTime(0);
    }
  }, [create_audio_mut.isSuccess, create_audio_mut.isError, create_audio_mut.isPending]);

  // Recording states
  const isBrowserSupported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    MediaRecorder.isTypeSupported('audio/webm; codecs=opus');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [recStatus, setRecStatus] = useState<
    'idle' | 'recording' | 'recorded' | 'uploading' | 'uploaded' | 'error'
  >('idle');
  const [recError, setRecError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [reviewPlaying, setReviewPlaying] = useState(false);
  const [recordElapsedMs, setRecordElapsedMs] = useState(0);
  const [recordedDurationSec, setRecordedDurationSec] = useState<number | null>(null);

  const formatDuration = (seconds: number | null | undefined) => {
    if (seconds == null || !isFinite(seconds)) return '...';
    const total = Math.max(0, Math.round(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (recStatus === 'recording') {
      setRecordElapsedMs(0);
      timer = setInterval(() => setRecordElapsedMs((t) => t + 100), 100);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [recStatus]);

  useEffect(() => {
    return () => {
      if (reviewAudioRef.current) reviewAudioRef.current.pause();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [recordedUrl]);

  const enumerateAudioDevices = async () => {
    try {
      setRecError(null);
      // Request permission so labels populate
      const tmpStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === 'audioinput');
      setDevices(inputs);
      if (!selectedDeviceId && inputs.length > 0) setSelectedDeviceId(inputs[0].deviceId);
      tmpStream.getTracks().forEach((t) => t.stop());
    } catch (e: any) {
      setRecError('Microphone permission denied or unavailable');
    }
  };

  const startRecording = async () => {
    if (!isBrowserSupported) return;
    try {
      setRecError(null);
      chunksRef.current = [];
      setRecordedDurationSec(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true
      });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm; codecs=opus' });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        // Compute duration when metadata loads
        try {
          const tempAudio = document.createElement('audio');
          tempAudio.preload = 'metadata';
          tempAudio.src = url;
          tempAudio.onloadedmetadata = () => {
            setRecordedDurationSec(tempAudio.duration);
          };
        } catch {}
        setRecStatus('recorded');
      };
      recorder.start();
      setRecStatus('recording');
    } catch (e: any) {
      setRecError('Failed to start recording');
      setRecStatus('error');
    }
  };

  const stopRecording = () => {
    try {
      recorderRef.current?.stop();
      recorderRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    } catch (e) {
      // ignore
    }
  };

  const playRecorded = () => {
    if (!recordedUrl) return;
    if (reviewPlaying) {
      if (reviewAudioRef.current) reviewAudioRef.current.pause();
      setReviewPlaying(false);
      return;
    }
    if (reviewAudioRef.current) {
      reviewAudioRef.current.pause();
      reviewAudioRef.current = null;
    }
    const audio = new Audio(recordedUrl);
    reviewAudioRef.current = audio as any;
    audio.onended = () => setReviewPlaying(false);
    audio.play();
    setReviewPlaying(true);
  };

  const reRecord = () => {
    setRecError(null);
    setRecStatus('idle');
    if (reviewAudioRef.current) reviewAudioRef.current.pause();
    setReviewPlaying(false);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedBlob(null);
    chunksRef.current = [];
  };

  const uploadRecorded = async () => {
    if (!recordedBlob) return;
    setRecError(null);
    setRecStatus('uploading');
    let s3KeyForCleanup: string | null = null;
    try {
      const text_key = await lipi_parivartak(
        wordItem.word,
        get_script_from_id(word_script_id),
        'Normal'
      );
      const { upload_url, s3_key } = await trpcClient.audio_assets.get_upload_audio_asset_url.query(
        {
          lang_id: langId,
          text: wordItem.word,
          text_key
        }
      );
      s3KeyForCleanup = s3_key;

      // Ensure Content-Type matches presigned expectations (video/webm for .webm)
      const putRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/webm' },
        body: recordedBlob
      });
      if (!putRes.ok) throw new Error('Upload failed');

      const completed = await trpcClient.audio_assets.complete_upload_audio_asset.mutate({
        lang_id: langId,
        text: wordItem.word,
        text_key,
        s3_key
      });

      setSelectedAudio({
        id: completed.id,
        description: completed.description,
        s3_key: completed.s3_key
      });
      queryClient.invalidateQueries(trpc.audio_assets.list_audio_assets.pathFilter());
      setRecStatus('uploaded');
    } catch (e: any) {
      try {
        if (s3KeyForCleanup) {
          await trpcClient.audio_assets.delete_uploaded_audio_file.mutate({
            s3_key: s3KeyForCleanup
          });
        }
      } catch {}
      setRecError('Upload failed');
      setRecStatus('recorded');
    }
  };

  return (
    <div className="my-6 space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
        <TabsList className="flex items-center justify-center">
          <TabsTrigger value="ai">AI Generate Audio</TabsTrigger>
          <TabsTrigger value="record">Record Audio</TabsTrigger>
        </TabsList>
        <TabsContent value="ai" className="space-y-4 pt-1">
          <div className="flex w-full items-center justify-center gap-6">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-semibold">Language</Label>
              <Select
                value={langId === null ? 'all' : String(langId)}
                onValueChange={(v) => setLangId(v === 'all' ? null : Number(v))}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {LANG_LIST.map((lang) => (
                    <SelectItem key={lang} value={String(lang_list_obj[lang as lang_list_type])}>
                      {lang}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-semibold">Voice</Label>
              <Select value={voice} onValueChange={(v) => setVoice(v as voice_types)}>
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue placeholder={DEFAULT_VOICE} />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_TYPE_LIST.map((voice) => (
                    <SelectItem key={voice} value={voice}>
                      {voice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center space-y-4">
            {!create_audio_mut.isSuccess && (
              <Button
                className="gap-4 text-lg font-semibold text-amber-600 dark:text-amber-400"
                variant={'outline'}
                disabled={create_audio_mut.isPending}
                onClick={handleCreateAudio}
              >
                <HiOutlineSparkles className="size-6 text-sky-400" />
                Create Audio for "{wordItem.word}"
              </Button>
            )}

            {create_audio_mut.isPending && (
              <div className="flex w-64 flex-col items-center justify-center space-y-3">
                <Skeleton className="h-14 w-14 rounded" />
                <div className="h-2 w-64 overflow-hidden rounded bg-muted">
                  <div
                    className="h-2 bg-primary"
                    style={{
                      width: `${Math.min((elapsedTime / AUDIO_AVERAGE_TIME_MS) * 100, 100)}%`
                    }}
                  />
                </div>
              </div>
            )}

            {create_audio_mut.isSuccess && (
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex size-14 items-center justify-center rounded bg-muted">
                    <FaRobot className="size-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {create_audio_mut.data.description}
                  </span>
                </div>
                <div className="space-x-4">
                  <Button
                    variant={'destructive'}
                    onClick={async () => {
                      if (!create_audio_mut.data) return;
                      await delete_audio_mut.mutateAsync({ id: create_audio_mut.data.id });
                      create_audio_mut.reset();
                    }}
                    disabled={delete_audio_mut.isPending}
                  >
                    Delete Audio
                  </Button>
                  <Button
                    variant={'secondary'}
                    onClick={() => handlePlayCreated(create_audio_mut.data.s3_key)}
                    className="ml-2"
                  >
                    {createdPlaying ? (
                      <span className="flex items-center gap-1">
                        <MdStop /> Stop
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <MdPlayArrow /> Play
                      </span>
                    )}
                  </Button>
                  <Button
                    variant={'outline'}
                    onClick={() => {
                      create_audio_mut.reset();
                      handleCreateAudio();
                    }}
                  >
                    Remake Audio
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="record">
          <div className="space-y-4 py-2">
            {!isBrowserSupported ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Your browser does not support WebM/Opus recording.
              </div>
            ) : (
              <>
                <div className="flex w-full flex-wrap items-center justify-center gap-6">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Language</Label>
                    <Select
                      value={langId === null ? 'all' : String(langId)}
                      onValueChange={(v) => setLangId(v === 'all' ? null : Number(v))}
                    >
                      <SelectTrigger size="sm" className="w-28">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {LANG_LIST.map((lang) => (
                          <SelectItem
                            key={lang}
                            value={String(lang_list_obj[lang as lang_list_type])}
                          >
                            {lang}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Mic</Label>
                    <Select
                      value={selectedDeviceId || 'none'}
                      onValueChange={(v) => setSelectedDeviceId(v === 'none' ? '' : v)}
                    >
                      <SelectTrigger size="sm" className="w-64">
                        <SelectValue placeholder="Select input" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select input</SelectItem>
                        {devices.map((d) => (
                          <SelectItem key={d.deviceId} value={d.deviceId}>
                            {d.label || 'Microphone'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="secondary" size="sm" onClick={enumerateAudioDevices}>
                      <MdMic className="mr-1" /> Detect
                    </Button>
                  </div>
                </div>

                {recError && <div className="text-center text-xs text-red-500">{recError}</div>}

                <div className="flex items-center justify-center gap-3">
                  {recStatus !== 'recording' && !recordedBlob && (
                    <Button
                      className="gap-2"
                      variant="outline"
                      disabled={!selectedDeviceId}
                      onClick={startRecording}
                    >
                      <MdMic className="text-emerald-600" /> Record
                    </Button>
                  )}
                  {recStatus === 'recording' && (
                    <Button className="gap-2" variant="destructive" onClick={stopRecording}>
                      <MdStop /> Stop
                    </Button>
                  )}
                  {recStatus === 'recorded' && (
                    <>
                      <Button className="gap-2" variant="secondary" onClick={playRecorded}>
                        {reviewPlaying ? (
                          <span className="flex items-center gap-1">
                            <MdStop /> Stop
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <MdPlayArrow /> Play
                          </span>
                        )}
                      </Button>
                      <Button className="gap-2" variant="outline" onClick={reRecord}>
                        <MdRefresh /> Re-record
                      </Button>
                      <Button className="gap-2" variant="default" onClick={uploadRecorded}>
                        <MdCloudUpload /> Upload
                      </Button>
                      <div className="text-xs text-muted-foreground">
                        Length: {formatDuration(recordedDurationSec)}
                      </div>
                    </>
                  )}
                  {recStatus === 'uploading' && (
                    <div className="text-sm text-muted-foreground">Uploading...</div>
                  )}
                  {recStatus === 'uploaded' && (
                    <>
                      <div className="text-sm text-emerald-600">Uploaded</div>
                      <Button className="gap-2" variant="outline" onClick={reRecord}>
                        <MdRefresh /> Re-record Another Audio
                      </Button>
                    </>
                  )}
                </div>

                {recStatus === 'recording' && (
                  <div className="text-center text-xs text-muted-foreground">
                    Recording... {Math.floor(recordElapsedMs / 1000)}s
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
