"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeArt } from "@/components/theme-art";
import { BrandBar, CheckIcon, Spinner } from "@/components/ui";
import { trackEvent } from "@/lib/analytics/client";
import { getAttribution, getVisitorId } from "@/lib/attribution";
import type { CreateBookPayload, CreateBookResponse } from "@/lib/contracts";
import {
  BookInput,
  COMPANIONS,
  MAX_AGE,
  MAX_TRAITS,
  MIN_AGE,
  PET_KINDS,
  PRONOUNS,
  TRAITS,
  type BookInputDraft,
  type CompanionKind,
  type PetKind,
  type Pronoun,
  type TraitId,
} from "@/lib/domain/book-input";
import { THEMES, type ThemeId } from "@/lib/domain/themes";
import { ACCEPTED_TYPES, preparePhoto, type PreparedPhoto } from "@/lib/photo";
import { CONSENT_TEXT, PHOTO_PROMISE } from "@/lib/site";

const STEPS = ["crianca", "foto", "aventura", "detalhes"] as const;
type Step = (typeof STEPS)[number];

type Draft = {
  childFirstName: string;
  childNickname: string;
  childAge: number | null;
  pronoun: Pronoun | null;
  theme: ThemeId | null;
  interests: string;
  traits: TraitId[];
  companionKind: "none" | CompanionKind;
  companionName: string;
  petKind: PetKind;
};

const EMPTY: Draft = {
  childFirstName: "",
  childNickname: "",
  childAge: null,
  pronoun: null,
  theme: null,
  interests: "",
  traits: [],
  companionKind: "none",
  companionName: "",
  petKind: "cachorro",
};

const DRAFT_KEY = "cq.draft.v1";

function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) } : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {}
}

function toInput(d: Draft): BookInputDraft {
  return {
    childFirstName: d.childFirstName,
    childNickname: d.childNickname || undefined,
    childAge: d.childAge ?? undefined,
    pronoun: d.pronoun ?? ("" as Pronoun),
    theme: d.theme ?? ("" as ThemeId),
    interests: d.interests || undefined,
    traits: d.traits,
    companion:
      d.companionKind === "none"
        ? { kind: "none" }
        : d.companionKind === "pet"
          ? { kind: "pet", name: d.companionName, petKind: d.petKind }
          : { kind: d.companionKind, name: d.companionName },
  };
}

const STEP_FIELDS: Record<Exclude<Step, "foto">, (keyof BookInput)[]> = {
  crianca: ["childFirstName", "childNickname", "childAge", "pronoun"],
  aventura: ["theme"],
  detalhes: ["interests", "traits", "companion"],
};

type Errors = Partial<Record<string, string>>;

function validate(step: Exclude<Step, "foto">, draft: Draft): Errors {
  const result = BookInput.safeParse(toInput(draft));
  if (result.success) return {};
  const errors: Errors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0]);
    if (!(STEP_FIELDS[step] as string[]).includes(field)) continue;
    // Our own messages are in Portuguese; Zod's built-in ones (unset choice, wrong type) are not.
    const builtIn = ["invalid_value", "invalid_type", "invalid_union"].includes(issue.code);
    errors[field] ??= (builtIn ? FALLBACK_MESSAGES[field] : issue.message) ?? "Confira este campo.";
  }
  return errors;
}

const FALLBACK_MESSAGES: Record<string, string> = {
  childAge: "Escolha a idade.",
  pronoun: "Escolha uma opção.",
  theme: "Escolha uma aventura.",
  traits: "Escolha até duas.",
  companion: "Digite o nome.",
  childFirstName: "Digite o nome da criança.",
};

const SUBMIT_ERRORS: Record<string, string> = {
  rate_limited: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
  invalid_photo: "Não conseguimos abrir essa foto. Escolha outra, em JPG ou da galeria do celular.",
  invalid_input: "Confira os dados da criança e tente de novo.",
  busy: "Estamos com muita procura agora. Tente de novo em alguns minutos.",
};

export function Wizard({ initialTheme, startAtPhoto }: { initialTheme?: ThemeId; startAtPhoto: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, theme: initialTheme ?? null });
  const [step, setStep] = useState<Step>("crianca");
  const [errors, setErrors] = useState<Errors>({});
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const started = useRef(false);

  // Restores the draft after a rejected photo, so only the photo needs replacing.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    trackEvent("create_started", { theme: initialTheme ?? "" });
    const saved = loadDraft();
    if (!saved) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from sessionStorage on mount
    setDraft({ ...saved, theme: initialTheme ?? saved.theme });
    if (startAtPhoto) setStep("foto");
  }, [initialTheme, startAtPhoto]);

  useEffect(() => saveDraft(draft), [draft]);

  const update = (change: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...change }));
    setErrors({});
  };

  const index = STEPS.indexOf(step);
  const go = (next: Step) => {
    setStep(next);
    setErrors({});
    window.scrollTo({ top: 0 });
  };

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPreparing(true);
    setPhotoError(null);
    try {
      const prepared = await preparePhoto(file);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      setPhoto(prepared);
      trackEvent("photo_uploaded", { dark: prepared.dark });
    } catch {
      setPhotoError("Não conseguimos abrir essa foto. Tente outra da galeria.");
    } finally {
      setPreparing(false);
    }
  }

  async function submit() {
    if (!photo) return go("foto");
    setSubmitting(true);
    setSubmitError(null);
    const payload: CreateBookPayload = {
      visitorId: getVisitorId(),
      consent: true,
      attribution: getAttribution(),
      input: toInput(draft),
    };
    const form = new FormData();
    form.set("photo", photo.jpeg, "foto.jpg");
    form.set("payload", JSON.stringify(payload));
    try {
      const res = await fetch("/api/books", { method: "POST", body: form });
      if (res.ok) {
        const { token } = (await res.json()) as CreateBookResponse;
        router.push(`/livro/${token}`);
        return;
      }
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      setSubmitError(SUBMIT_ERRORS[error ?? ""] ?? "Algo deu errado do nosso lado. Tente de novo em instantes.");
    } catch {
      setSubmitError("Sem conexão. Confira a internet e tente de novo.");
    }
    setSubmitting(false);
  }

  function next() {
    if (step === "foto") {
      if (!photo) return setPhotoError(consent ? "Escolha uma foto para continuar." : "Marque a autorização para continuar.");
      return go("aventura");
    }
    const found = validate(step, draft);
    if (Object.keys(found).length) return setErrors(found);
    if (step === "crianca") {
      trackEvent("child_info_completed", { age: draft.childAge ?? 0 });
      return go("foto");
    }
    if (step === "aventura") {
      trackEvent("theme_selected", { theme: draft.theme ?? "" });
      return go("detalhes");
    }
    trackEvent("personalization_completed", { traits: draft.traits.length, companion: draft.companionKind });
    void submit();
  }

  const name = draft.childFirstName.trim().replace(/\s+/g, " ") || "a criança";

  if (submitting) return <Submitting name={name} />;

  return (
    <main className="flex flex-1 flex-col">
      <BrandBar>
        {index > 0 && (
          <button type="button" onClick={() => go(STEPS[index - 1])} className="min-h-12 px-2 font-bold text-ink/70">
            ← Voltar
          </button>
        )}
      </BrandBar>
      <div className="mx-auto w-full max-w-md px-5">
        <div className="flex gap-1.5" aria-label={`Etapa ${index + 1} de ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-ink" : "bg-line"}`} />
          ))}
        </div>
      </div>

      <section key={step} className="animate-rise mx-auto w-full max-w-md flex-1 px-5 pt-6">
        {step === "crianca" && <ChildStep draft={draft} errors={errors} update={update} />}
        {step === "foto" && (
          <PhotoStep
            name={name}
            consent={consent}
            setConsent={setConsent}
            photo={photo}
            preparing={preparing}
            error={photoError}
            onPhoto={onPhoto}
          />
        )}
        {step === "aventura" && <ThemeStep name={name} draft={draft} errors={errors} update={update} />}
        {step === "detalhes" && <DetailsStep name={name} draft={draft} errors={errors} update={update} />}
        {submitError && <p className="mt-5 rounded-2xl bg-rose-soft p-4 font-semibold text-[#9b2c3f]" role="alert">{submitError}</p>}
      </section>

      <div className="sticky bottom-0 z-30 mt-8 bg-gradient-to-t from-paper via-paper/95 to-transparent px-5 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md">
          <button type="button" onClick={next} className="btn-primary" disabled={step === "foto" && preparing}>
            {step === "detalhes" ? "VER A CAPA DO LIVRO" : "CONTINUAR"}
          </button>
        </div>
      </div>
    </main>
  );
}

type StepProps = { draft: Draft; errors: Errors; update: (change: Partial<Draft>) => void };

function Heading({ title, text }: { title: string; text?: string }) {
  return (
    <>
      <h1 className="display text-[2.1rem] text-balance">{title}</h1>
      {text && <p className="mt-2 text-ink/70">{text}</p>}
    </>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-2 text-sm font-bold text-[#b2394d]">{message}</p> : null;
}

function ChildStep({ draft, errors, update }: StepProps) {
  return (
    <>
      <Heading title="Quem é a estrela da história?" text="Só o primeiro nome. Nada de sobrenome, escola ou endereço." />
      <label className="mt-7 block">
        <span className="font-extrabold">Nome da criança</span>
        <input
          className="field mt-2"
          value={draft.childFirstName}
          onChange={(e) => update({ childFirstName: e.target.value })}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          maxLength={24}
          placeholder="Ex.: Lucas"
        />
        <FieldError message={errors.childFirstName} />
      </label>

      <fieldset className="mt-7">
        <legend className="font-extrabold">Idade</legend>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => MIN_AGE + i).map((age) => (
            <button key={age} type="button" className="chip px-0" aria-pressed={draft.childAge === age} onClick={() => update({ childAge: age })}>
              {age}
            </button>
          ))}
        </div>
        <FieldError message={errors.childAge} />
      </fieldset>

      <fieldset className="mt-7">
        <legend className="font-extrabold">Na história, usamos</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(PRONOUNS) as Pronoun[]).map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={draft.pronoun === p} onClick={() => update({ pronoun: p })}>
              {PRONOUNS[p].label}
            </button>
          ))}
        </div>
        <FieldError message={errors.pronoun} />
      </fieldset>

      <label className="mt-7 block">
        <span className="font-extrabold">Apelido carinhoso</span> <span className="text-stone">(opcional)</span>
        <input
          className="field mt-2"
          value={draft.childNickname}
          onChange={(e) => update({ childNickname: e.target.value })}
          autoComplete="off"
          maxLength={20}
          placeholder="Ex.: Lulu"
        />
        <FieldError message={errors.childNickname} />
      </label>
    </>
  );
}

function PhotoStep({
  name,
  consent,
  setConsent,
  photo,
  preparing,
  error,
  onPhoto,
}: {
  name: string;
  consent: boolean;
  setConsent: (v: boolean) => void;
  photo: PreparedPhoto | null;
  preparing: boolean;
  error: string | null;
  onPhoto: (file: File | undefined) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  return (
    <>
      <Heading title={`Uma foto de ${name}`} text="Escolha uma foto clara, de frente e com o rosto visível." />

      <ul className="mt-5 grid grid-cols-3 gap-2 text-center text-[0.8125rem] leading-tight font-bold text-ink/75">
        {["Só a criança na foto", "Rosto de frente", "Boa luz, sem filtro"].map((tip) => (
          <li key={tip} className="card flex flex-col items-center gap-1.5 px-2 py-3">
            <span className="flex size-6 items-center justify-center rounded-full bg-leaf text-white"><CheckIcon className="size-3.5" /></span>
            {tip}
          </li>
        ))}
      </ul>

      <label className="card mt-5 flex cursor-pointer gap-3 p-4">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-6 shrink-0 accent-[#2b2320]" />
        <span className="text-[0.95rem] leading-snug font-semibold">{CONSENT_TEXT}</span>
      </label>

      {photo ? (
        <div className="mt-5 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img src={photo.previewUrl} alt="Foto escolhida" className="size-28 rounded-3xl object-cover ring-4 ring-white" />
          <div className="flex-1">
            <p className="flex items-center gap-1.5 font-extrabold text-leaf"><CheckIcon className="size-4" /> Foto pronta</p>
            {photo.dark && <p className="mt-1 text-sm font-semibold text-[#9a6b12]">Parece um pouco escura. Se puder, use uma foto com mais luz.</p>}
            <button type="button" onClick={() => gallery.current?.click()} className="mt-2 min-h-11 font-bold underline underline-offset-4">
              Trocar foto
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" disabled={!consent || preparing} onClick={() => camera.current?.click()} className="btn-secondary min-h-16 disabled:opacity-40">
            TIRAR FOTO
          </button>
          <button type="button" disabled={!consent || preparing} onClick={() => gallery.current?.click()} className="btn-secondary min-h-16 disabled:opacity-40">
            DA GALERIA
          </button>
        </div>
      )}
      {preparing && (
        <p className="mt-4 flex items-center gap-2 font-semibold text-ink/70"><Spinner className="size-5" /> Preparando a foto…</p>
      )}
      {error && <p className="mt-4 font-bold text-[#b2394d]" role="alert">{error}</p>}

      <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
      <input ref={gallery} type="file" accept={ACCEPTED_TYPES} hidden onChange={(e) => onPhoto(e.target.files?.[0])} />

      <p className="mt-6 text-sm leading-relaxed text-stone">
        A foto será usada apenas para criar a referência visual da personagem. O resultado é uma ilustração, nunca uma cópia da foto. {PHOTO_PROMISE}
      </p>
    </>
  );
}

function ThemeStep({ name, draft, errors, update }: StepProps & { name: string }) {
  return (
    <>
      <Heading title={`Qual aventura ${name} vai viver?`} />
      <div className="mt-6 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Aventuras">
        {Object.values(THEMES).map((theme) => {
          const selected = draft.theme === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => update({ theme: theme.id as ThemeId })}
              className={`card overflow-hidden p-0 text-left transition active:scale-[0.98] ${selected ? "outline-[3px] outline-ink outline-solid" : ""}`}
            >
              <ThemeArt themeId={theme.id} className="aspect-[4/3]" />
              <span className="block px-3 pt-2.5 pb-3">
                <span className="flex items-center justify-between font-extrabold">
                  {theme.name}
                  {selected && <span className="flex size-6 items-center justify-center rounded-full bg-ink text-paper"><CheckIcon className="size-3.5" /></span>}
                </span>
                <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink/60">{theme.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <FieldError message={errors.theme} />
    </>
  );
}

function DetailsStep({ name, draft, errors, update }: StepProps & { name: string }) {
  const toggleTrait = (trait: TraitId) => {
    const has = draft.traits.includes(trait);
    if (!has && draft.traits.length >= MAX_TRAITS) return update({ traits: [...draft.traits.slice(1), trait] });
    update({ traits: has ? draft.traits.filter((t) => t !== trait) : [...draft.traits, trait] });
  };
  return (
    <>
      <Heading title={`Conte um pouco sobre ${name}`} />

      <label className="mt-7 block">
        <span className="font-extrabold">O que essa criança mais gosta?</span> <span className="text-stone">(opcional)</span>
        <input
          className="field mt-2"
          value={draft.interests}
          onChange={(e) => update({ interests: e.target.value })}
          maxLength={80}
          autoComplete="off"
          placeholder="Ex.: dinossauros, futebol, astronomia"
        />
        <FieldError message={errors.interests} />
      </label>

      <fieldset className="mt-7">
        <legend className="font-extrabold">Qual característica combina mais com ela?</legend>
        <p className="text-sm text-stone">Escolha até duas.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(TRAITS) as TraitId[]).map((trait) => (
            <button key={trait} type="button" className="chip" aria-pressed={draft.traits.includes(trait)} onClick={() => toggleTrait(trait)}>
              {TRAITS[trait].label}
            </button>
          ))}
        </div>
        <FieldError message={errors.traits} />
      </fieldset>

      <fieldset className="mt-7">
        <legend className="font-extrabold">Existe alguém especial que você gostaria de incluir?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {([...Object.keys(COMPANIONS), "none"] as ("none" | CompanionKind)[]).map((kind) => (
            <button key={kind} type="button" className="chip" aria-pressed={draft.companionKind === kind} onClick={() => update({ companionKind: kind })}>
              {kind === "none" ? "Ninguém" : COMPANIONS[kind].label}
            </button>
          ))}
        </div>
        {draft.companionKind !== "none" && (
          <div className="animate-fade mt-3">
            {draft.companionKind === "pet" && (
              <div className="mb-3 flex flex-wrap gap-2">
                {(Object.keys(PET_KINDS) as PetKind[]).map((pet) => (
                  <button key={pet} type="button" className="chip" aria-pressed={draft.petKind === pet} onClick={() => update({ petKind: pet })}>
                    {PET_KINDS[pet].label}
                  </button>
                ))}
              </div>
            )}
            <input
              className="field"
              value={draft.companionName}
              onChange={(e) => update({ companionName: e.target.value })}
              maxLength={20}
              autoComplete="off"
              placeholder="Só o nome"
              aria-label="Nome"
            />
          </div>
        )}
        <FieldError message={errors.companion} />
      </fieldset>
    </>
  );
}

function Submitting({ name }: { name: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <Spinner className="size-14" />
      <p className="display mt-7 text-[1.9rem]">Enviando a foto de {name}…</p>
      <p className="mt-2 text-ink/70">Em seguida começamos a desenhar a capa.</p>
    </main>
  );
}
