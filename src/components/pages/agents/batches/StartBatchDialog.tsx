import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import {
  BATCH_AUTO_APPLY,
  BATCH_PARALLELISM,
  BATCH_REFERENCE_META,
  BATCH_REFERENCES,
  DEFAULT_BATCH_PROMPT,
  MAX_BATCH_GESTURES,
  type BatchAutoApply,
  type BatchReference
} from '~/agents/batch';
import { type AgentModelId } from '~/agents/models';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { Spinner } from '~/components/ui/spinner';
import { Textarea } from '~/components/ui/textarea';
import { ModelPicker } from '../chat/ModelPicker';

/** Queue one Gesture Creator run per selected gesture, each in its own focused chat. */
export function StartBatchDialog({
  gestureIds,
  open,
  onOpenChange
}: {
  gestureIds: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [model, setModel] = useState<AgentModelId>('gemini-3.7-flash');
  const [prompt, setPrompt] = useState(DEFAULT_BATCH_PROMPT);
  const [reference, setReference] = useState<BatchReference>('none');
  const [autoApply, setAutoApply] = useState<BatchAutoApply>('never');
  const [parallelism, setParallelism] = useState<number>(BATCH_PARALLELISM.default);
  const [budget, setBudget] = useState('');

  const create_mut = useMutation(
    trpc.agents.create_batch.mutationOptions({
      onSuccess: (result) => {
        void queryClient.invalidateQueries({ queryKey: trpc.agents.list_batches.queryKey() });
        toast.success(`Batch started with ${result.items} gestures`);
        onOpenChange(false);
        void navigate({
          to: '/admin/agents/batches/$batchId',
          params: { batchId: String(result.batch_id) }
        });
      },
      onError: (error) => toast.error(error.message)
    })
  );

  const submit = () => {
    const trimmedBudget = budget.trim();
    const parsedBudget = trimmedBudget === '' ? null : Number(trimmedBudget);
    if (parsedBudget !== null && !(parsedBudget > 0 && parsedBudget <= 500)) {
      toast.error('Budget must be between 0 and 500 USD, or empty for no cap.');
      return;
    }
    const clampedParallelism = Math.min(
      BATCH_PARALLELISM.max,
      Math.max(BATCH_PARALLELISM.min, Math.floor(parallelism) || BATCH_PARALLELISM.default)
    );
    const trimmedTitle = title.trim();
    if (gestureIds.length > MAX_BATCH_GESTURES) {
      toast.error(`A batch takes at most ${MAX_BATCH_GESTURES} gestures; select fewer.`);
      return;
    }
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      toast.error('The prompt cannot be empty.');
      return;
    }
    create_mut.mutate({
      gesture_ids: gestureIds,
      model,
      prompt: trimmedPrompt,
      reference,
      auto_apply: autoApply,
      parallelism: clampedParallelism,
      budget_usd: parsedBudget,
      title: trimmedTitle === '' ? undefined : trimmedTitle
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Run agents on {gestureIds.length} gestures</DialogTitle>
          <DialogDescription>
            One Gesture Creator run per gesture, each in its own focused chat. Runs queue through
            QStash and leave a proposal for review.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batch-title">Title (optional)</Label>
            <Input
              id="batch-title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              maxLength={120}
              placeholder="e.g. Trace Devanagari vowels"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label id="batch-model-label">Model</Label>
            <span aria-labelledby="batch-model-label">
              <ModelPicker value={model} onChange={setModel} />
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batch-prompt">Prompt</Label>
            <Textarea
              id="batch-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.currentTarget.value)}
              maxLength={2000}
              rows={3}
              className="text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Reference</Label>
            <RadioGroup
              value={reference}
              onValueChange={(next) => {
                const parsed = BATCH_REFERENCES.find((id) => id === next);
                if (parsed) setReference(parsed);
              }}
            >
              {BATCH_REFERENCES.map((id) => (
                <label key={id} className="flex cursor-pointer items-start gap-2 text-sm">
                  <RadioGroupItem value={id} aria-label={BATCH_REFERENCE_META[id].label} />
                  <span>
                    <span className="font-medium">{BATCH_REFERENCE_META[id].label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {BATCH_REFERENCE_META[id].hint}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Auto-apply</Label>
            <RadioGroup
              value={autoApply}
              onValueChange={(next) => {
                const parsed = BATCH_AUTO_APPLY.find((id) => id === next);
                if (parsed) setAutoApply(parsed);
              }}
            >
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <RadioGroupItem value="never" aria-label="Never auto-apply" />
                <span>
                  <span className="font-medium">Never</span>
                  <span className="block text-xs text-muted-foreground">
                    Every proposal waits for review.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <RadioGroupItem value="when_empty" aria-label="Auto-apply when empty" />
                <span>
                  <span className="font-medium">When empty</span>
                  <span className="block text-xs text-muted-foreground">
                    Gestures without strokes get the proposal saved right away as Unreviewed.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="batch-parallelism">Agents at once</Label>
              <Input
                id="batch-parallelism"
                type="number"
                min={BATCH_PARALLELISM.min}
                max={BATCH_PARALLELISM.max}
                value={parallelism}
                onChange={(event) => setParallelism(Number(event.currentTarget.value))}
              />
              <p className="text-xs text-muted-foreground">
                {BATCH_PARALLELISM.min}–{BATCH_PARALLELISM.max}, {BATCH_PARALLELISM.default}{' '}
                recommended; QStash free plan allows up to 10 across all apps.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="batch-budget">Budget USD (optional)</Label>
              <Input
                id="batch-budget"
                type="number"
                min={0}
                max={500}
                step="0.5"
                value={budget}
                onChange={(event) => setBudget(event.currentTarget.value)}
                placeholder="No cap"
              />
              <p className="text-xs text-muted-foreground">
                Stops starting runs once the batch has cost this much.
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create_mut.isPending || gestureIds.length === 0}>
            {create_mut.isPending ? <Spinner /> : null}
            Start batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
