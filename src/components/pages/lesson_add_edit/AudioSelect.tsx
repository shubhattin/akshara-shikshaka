'use client';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTRPC } from '~/api/client';
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
import { FaExternalLinkAlt, FaRobot } from 'react-icons/fa';
import { HiOutlineSparkles } from 'react-icons/hi';
import type WaveSurfer from 'wavesurfer.js';
import WaveSurferPlayer from '@wavesurfer/react';
import AudioMotionAnalyzer from 'audiomotion-analyzer';
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
import Link from 'next/link';

type Props = {
  onAudioSelect: (audio: audio_type) => void;
  // this can be both varna or a word
  type: 'varna' | 'word';
  text: string;
};

const selected_audio_atom = atom<audio_type | null>(null);

export default function AudioSelect(props: Props) {
  const [tab, setTab] = useState<'add' | 'make'>('make');
  const [selectedAudio, setSelectedAudio] = useAtom(selected_audio_atom);

  useEffect(() => {
    setSelectedAudio(null);
  }, []);

  const [createTab, setCreateTab] = useState<'ai' | 'record'>('record');

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
          <div className="my-6 space-y-4">
            <Tabs
              value={createTab}
              onValueChange={(v) => setCreateTab(v as typeof createTab)}
              className="w-full"
            >
              <TabsList className="flex items-center justify-center">
                <TabsTrigger value="ai">AI Generate Audio</TabsTrigger>
                <TabsTrigger value="record">Record Audio</TabsTrigger>
              </TabsList>
              <TabsContent value="ai" className="space-y-4 pt-1">
                <AudioCreation {...props} />
              </TabsContent>
              <TabsContent value="record">
                <AudioRecord {...props} />
              </TabsContent>
            </Tabs>
          </div>
        </TabsContent>
      </Tabs>
      <Button
        onClick={() => props.onAudioSelect(selectedAudio!)}
        disabled={!selectedAudio}
        className="text-lg"
        variant="outline"
      >
        <IoAddOutline className="size-6 text-yellow-600 dark:text-yellow-400" />{' '}
        {props.type === 'varna' ? 'Add Audio to Varna' : 'Add Audio to Word'}
      </Button>
    </div>
  );
}

const AUDIO_AVERAGE_TIME_MS = ms('6s');

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
      <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 lg:gap-8">
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
        <Link href="/audio_assets" target="_blank" className="group flex items-center gap-2">
          <FaExternalLinkAlt className="size-4 text-yellow-300 group-hover:text-blue-400" />
          <span className="text-sm text-teal-300 group-hover:text-sky-400">Manage Audio</span>
        </Link>
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

type voice_types = (typeof VOICE_TYPE_LIST)[number];
const DEFAULT_VOICE = 'alloy' satisfies voice_types;

const AudioCreation = ({ text }: Props) => {
  const trpc = useTRPC();
  const [, setSelectedAudio] = useAtom(selected_audio_atom);
  const queryClient = useQueryClient();
  const [elapsedTime, setElapsedTime] = useState(0);

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

  const [createdPlaying, setCreatedPlaying] = useState(false);

  const lesson_lang_id = useAtomValue(lang_id_atom);
  const handleCreateAudio = async () => {
    setSelectedAudio(null);
    create_audio_mut.reset();
    const text_key = await lipi_parivartak(text, get_script_from_id(word_script_id), 'Normal');
    const voice_language = get_lang_from_id(lesson_lang_id); // for prompting the tts model
    create_audio_mut.mutate({
      text: text,
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

  return (
    <>
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
            Create Audio for "{text}"
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
            <div className="ml-2 w-full max-w-md">
              <WaveformPlayer
                audioUrl={`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${create_audio_mut.data.s3_key}`}
                isPlaying={createdPlaying}
                onPlay={() => setCreatedPlaying(true)}
                onPause={() => setCreatedPlaying(false)}
              />
            </div>
            <div className="space-x-4">
              <Button
                variant={'outline'}
                onClick={() => {
                  handleCreateAudio();
                }}
              >
                Remake Audio
              </Button>
              <Button
                variant={'destructive'}
                onClick={async () => {
                  if (!create_audio_mut.data) return;
                  setSelectedAudio(null);
                  await delete_audio_mut.mutateAsync({ id: create_audio_mut.data.id });
                  create_audio_mut.reset();
                }}
                disabled={delete_audio_mut.isPending}
              >
                Delete Audio
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const selected_device_id_atom = atom<string | null>(null);
const SELECTED_DEVICE_ID_STORAGE_KEY = 'selected_device_id';

const AudioRecord = ({ text }: Props) => {
  // const trpcClient = useTRPCClient();
  const [langId, setLangId] = useState<number | null>(null);
  const word_script_id = useAtomValue(base_word_script_id_atom);
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const [, setSelectedAudio] = useAtom(selected_audio_atom);

  // Recording states
  const isBrowserSupported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    MediaRecorder.isTypeSupported('audio/webm; codecs=opus');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useAtom(selected_device_id_atom);
  const [recStatus, setRecStatus] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [recError, setRecError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [reviewPlaying, setReviewPlaying] = useState(false);
  const [recordElapsedMs, setRecordElapsedMs] = useState(0);
  const [recordedDurationSec, setRecordedDurationSec] = useState<number | null>(null);

  const get_upload_url_mut = useMutation(
    trpc.audio_assets.get_upload_audio_asset_url.mutationOptions({
      async onSuccess(data) {
        // Ensure Content-Type matches presigned expectations (video/webm for .webm)
        const putRes = await fetch(data.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': 'video/webm' },
          body: recordedBlob
        });
        if (!putRes.ok) throw new Error('Upload failed');

        const text_key = await lipi_parivartak(text, get_script_from_id(word_script_id), 'Normal');
        complete_upload_mut.mutateAsync({
          lang_id: langId,
          text: text,
          text_key,
          s3_key: data.s3_key
        });
      }
    })
  );

  const complete_upload_mut = useMutation(
    trpc.audio_assets.complete_upload_audio_asset.mutationOptions({
      async onSuccess(data) {
        setSelectedAudio({
          id: data.id,
          description: data.description,
          s3_key: data.s3_key
        });
        queryClient.invalidateQueries(trpc.audio_assets.list_audio_assets.pathFilter());
      },
      onError: (error) => {
        // delete_uploaded_audio_file_mut.mutateAsync({
        //   s3_key: error.data.
        // });
      }
    })
  );

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
      const previousSelectedDeviceId = JSON.parse(
        localStorage.getItem(SELECTED_DEVICE_ID_STORAGE_KEY) ?? 'null'
      );
      const prevSelectedDeviceInList = inputs.some((d) => d.deviceId === previousSelectedDeviceId);
      if (inputs.length === 0) {
        setSelectedDeviceId(null);
        localStorage.removeItem(SELECTED_DEVICE_ID_STORAGE_KEY);
      } else if (prevSelectedDeviceInList && previousSelectedDeviceId) {
        setSelectedDeviceId(previousSelectedDeviceId);
      } else {
        const fallbackDeviceId = inputs[0].deviceId;
        setSelectedDeviceId(fallbackDeviceId);
        localStorage.setItem(SELECTED_DEVICE_ID_STORAGE_KEY, JSON.stringify(fallbackDeviceId));
      }
      tmpStream.getTracks().forEach((t) => t.stop());
    } catch (e: any) {
      setRecError('Microphone permission denied or unavailable');
    }
  };

  useEffect(() => {
    enumerateAudioDevices();
    // on Mount fetch the devices
  }, []);

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
    setReviewPlaying(true);
  };

  const pauseRecorded = () => {
    setReviewPlaying(false);
  };

  const reRecord = () => {
    setSelectedAudio(null);
    setRecError(null);
    setRecStatus('idle');
    get_upload_url_mut.reset();
    complete_upload_mut.reset();
    setReviewPlaying(false);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedBlob(null);
    chunksRef.current = [];
  };

  const upload_recorded_func = async () => {
    if (!recordedBlob) return;
    setRecError(null);
    const text_key = await lipi_parivartak(text, get_script_from_id(word_script_id), 'Normal');
    await get_upload_url_mut.mutateAsync({
      lang_id: langId,
      text: text,
      text_key
    });
  };

  const uploading_status = get_upload_url_mut.isPending || complete_upload_mut.isPending;

  return (
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
                disabled={recStatus === 'recording' || recStatus === 'recorded'}
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
              <Label className="text-sm font-semibold">Mic</Label>
              <Select
                disabled={recStatus === 'recording' || recStatus === 'recorded'}
                value={selectedDeviceId || 'none'}
                onValueChange={(v) => {
                  setSelectedDeviceId(v === 'none' ? null : v);
                  localStorage.setItem(SELECTED_DEVICE_ID_STORAGE_KEY, JSON.stringify(v));
                }}
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
              <Button
                variant="secondary"
                size="sm"
                onClick={enumerateAudioDevices}
                disabled={recStatus === 'recording' || recStatus === 'recorded'}
              >
                <MdMic className="mr-1" /> Detect
              </Button>
            </div>
          </div>

          {recError && <div className="text-center text-xs text-red-500">{recError}</div>}

          {/* Recording Visualization */}
          {recStatus === 'recording' && (
            <div className="space-y-4">
              <RecordingVisualization stream={streamRef.current} isRecording={true} />
              <div className="text-center text-xs text-muted-foreground">
                Recording... {Math.floor(recordElapsedMs / 1000)}s
              </div>
            </div>
          )}

          {/* Recorded Audio Waveform Player */}
          {recStatus === 'recorded' && recordedUrl && (
            <div className="flex flex-col items-center space-y-4">
              <div className="text-xs text-muted-foreground">
                Length: {formatDuration(recordedDurationSec)}
              </div>
              <div className="w-full max-w-md">
                <WaveformPlayer
                  audioUrl={recordedUrl}
                  isPlaying={reviewPlaying}
                  onPlay={playRecorded}
                  onPause={pauseRecorded}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            {!complete_upload_mut.isSuccess && (
              <>
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
                    <Button
                      className="gap-2"
                      variant="outline"
                      onClick={reRecord}
                      disabled={uploading_status}
                    >
                      <MdRefresh /> Re-record
                    </Button>
                    <Button className="gap-2" variant="default" onClick={upload_recorded_func}>
                      <MdCloudUpload /> Upload
                    </Button>
                  </>
                )}
                {uploading_status && (
                  <div className="text-sm text-muted-foreground">Uploading...</div>
                )}
              </>
            )}
            {complete_upload_mut.isSuccess && (
              <>
                <div className="text-sm text-emerald-600">Uploaded</div>
                <Button className="gap-2" variant="outline" onClick={reRecord}>
                  <MdRefresh /> Re-record Another Audio
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// Live waveform visualization component
const LiveWaveform = ({
  stream,
  isRecording
}: {
  stream: MediaStream | null;
  isRecording: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || !isRecording) {
      // Stop visualization
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      return;
    }

    try {
      // Set up audio context and analyser for time-domain data
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();

      // Configure for waveform (time-domain) analysis
      analyser.fftSize = 2048; // Higher resolution for smoother waveform
      analyser.smoothingTimeConstant = 0.8;

      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const bufferLength = analyser.fftSize;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const draw = () => {
        if (!isRecording || !analyserRef.current) return;

        animationRef.current = requestAnimationFrame(draw);

        // Create new data array each frame to avoid TypeScript issues
        const dataArray = new Uint8Array(bufferLength);

        // Get time-domain data (waveform)
        analyserRef.current.getByteTimeDomainData(dataArray);

        // Clear canvas with dark background
        ctx.fillStyle = 'rgb(17, 24, 39)'; // bg-gray-900 equivalent
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw waveform
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#06b6d4'; // cyan-500 for the waveform line
        ctx.beginPath();

        const sliceWidth = canvas.width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          // Convert from 0-255 to -1 to 1, then scale to canvas height
          const v = (dataArray[i] - 128) / 128;
          const y = (v * canvas.height) / 2 + canvas.height / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.stroke();

        // Draw center line for reference
        ctx.strokeStyle = 'rgba(156, 163, 175, 0.3)'; // gray-400 with opacity
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      };

      draw();
    } catch (error) {
      console.error('Error setting up waveform visualization:', error);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stream, isRecording]);

  return (
    <div className="space-y-2">
      <div className="text-center text-xs text-muted-foreground">Live Waveform</div>
      <canvas
        ref={canvasRef}
        width={280}
        height={80}
        className="h-20 w-full overflow-hidden rounded border border-gray-300 bg-gray-900"
      />
    </div>
  );
};

// Spectrum analyzer visualization component
const SpectrumAnalyzer = ({
  stream,
  isRecording
}: {
  stream: MediaStream | null;
  isRecording: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<AudioMotionAnalyzer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || !isRecording || !containerRef.current) {
      // Stop visualization
      if (analyzerRef.current) {
        analyzerRef.current.destroy();
        analyzerRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      return;
    }

    try {
      // Set up audio context and analyzer
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);

      audioContextRef.current = audioContext;

      // Create AudioMotion analyzer (spectrum analyzer visualization)
      const analyzer = new AudioMotionAnalyzer(containerRef.current, {
        source,
        mode: 6, // 1/6 octave bands
        barSpace: 0.2,
        bgAlpha: 0.7,
        gradient: 'rainbow',
        height: 80,
        lumiBars: true,
        reflexRatio: 0.3,
        showBgColor: true,
        showPeaks: true,
        smoothing: 0.7,
        volume: 0, // Disable speaker output while keeping visualization
        colorMode: 'bar-level'
      });

      analyzerRef.current = analyzer;
    } catch (error) {
      console.error('Error setting up spectrum analyzer:', error);
    }

    return () => {
      if (analyzerRef.current) {
        analyzerRef.current.destroy();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stream, isRecording]);

  return (
    <div className="space-y-2">
      <div className="text-center text-xs text-muted-foreground">Spectrum Analyzer</div>
      <div
        ref={containerRef}
        className="h-20 w-full overflow-hidden rounded border border-gray-300 bg-gray-900"
        style={{ height: '80px' }}
      />
    </div>
  );
};

// Combined recording visualization with both waveform and spectrum
const RecordingVisualization = ({
  stream,
  isRecording
}: {
  stream: MediaStream | null;
  isRecording: boolean;
}) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LiveWaveform stream={stream} isRecording={isRecording} />
        <SpectrumAnalyzer stream={stream} isRecording={isRecording} />
      </div>
    </div>
  );
};

// Waveform player component for playback
const WaveformPlayer = ({
  audioUrl,
  isPlaying,
  onPlay,
  onPause
}: {
  audioUrl: string;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
}) => {
  const [wavesurfer, setWavesurfer] = useState<WaveSurfer | null>(null);

  const onReady = useCallback((ws: WaveSurfer) => {
    setWavesurfer(ws);
  }, []);

  const onPlayPause = useCallback(() => {
    if (wavesurfer) {
      if (isPlaying) {
        wavesurfer.pause();
        onPause();
      } else {
        wavesurfer.play();
        onPlay();
      }
    }
  }, [wavesurfer, isPlaying, onPlay, onPause]);

  return (
    <div className="flex flex-col items-center space-y-3">
      <div className="w-96 max-w-full">
        <WaveSurferPlayer
          height={60}
          waveColor="#4f46e5"
          progressColor="#06b6d4"
          cursorColor="#ef4444"
          barWidth={2}
          barRadius={1}
          url={audioUrl}
          onReady={onReady}
          onPlay={onPlay}
          onPause={onPause}
        />
      </div>
      <div className="flex justify-center">
        <Button variant="secondary" onClick={onPlayPause} className="gap-2">
          {isPlaying ? (
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
    </div>
  );
};
