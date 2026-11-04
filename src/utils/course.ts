import { getCollection, type CollectionEntry } from 'astro:content';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isLocked } from '../../scripts/config.mjs';

// =============================================================
// course.ts - le cours, tel que les pages le lisent
//
// L'accueil, les leçons, la page des présentations et celle des
// sources ont toutes besoin de la même chose : les modules dans
// l'ordre, leurs leçons dans l'ordre, ce qui est verrouillé, et
// le PDF résumé quand il existe. Chacune le recalculait de son
// côté ; une règle de tri changée à un endroit aurait fini par
// donner deux sommaires différents.
//
// Code de build uniquement (lecture du disque) : rien ici ne part
// dans le navigateur.
// =============================================================

export type Lesson = CollectionEntry<'lecons'>;

export interface CourseLesson {
  id: string;
  title: string;
  description?: string;
  /** Rang de la leçon dans son module, à partir de 1, verrouillées comprises. */
  position: number;
  locked: boolean;
  /** L'adresse de la page ; null pour une leçon verrouillée, qui n'en a pas. */
  url: string | null;
  entry: Lesson;
}

export interface CourseModule {
  /** Le libellé complet du frontmatter : « Module 1 - Prendre le template en main ». */
  name: string;
  /** Le même, sans le préfixe « Module 1 - » : « Prendre le template en main ». */
  shortName: string;
  /** Rang du module dans le cours, à partir de 1. */
  number: number;
  /** Le dossier du module (« module-1 »), qui nomme aussi son PDF. */
  dir: string;
  lessons: CourseLesson[];
  /** L'adresse du PDF résumé, s'il a été généré par `npm run slides`. */
  pdf: string | null;
}

/**
 * « Module 1 - Prendre le template en main » → « Prendre le template en main ».
 *
 * Le numéro est déjà porté par une pastille ou un surtitre : répété dans le
 * titre, il s'afficherait deux fois. Un libellé qui ne suit pas ce modèle est
 * rendu tel quel - on ne devine pas.
 */
export function shortModuleName(name: string): string {
  return name.replace(/^module\s+\d+\s*[-–—:·.]\s*/i, '').trim() || name;
}

/** « 1 » → « 01 » : les numéros de module s'alignent dans les listes. */
export function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Durée de lecture, en minutes, comptée sur le source de la leçon.
 *
 * Les imports, les balises de composants et la syntaxe markdown sont retirés
 * avant de compter : ils gonfleraient le total sans rien donner à lire. 200
 * mots par minute est la vitesse habituellement retenue pour un texte
 * d'apprentissage en français, plus lente que celle d'un article.
 */
export function readingTime(body: string | undefined): number {
  const text = (body ?? '')
    .replace(/^import .*$/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`|[\]()-]/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Le nom du PDF d'un module tel qu'il atterrira dans les téléchargements de
 * l'apprenant : « module-1.pdf » ne lui dirait rien. Les caractères interdits
 * dans un nom de fichier (Windows compris) sont remplacés.
 */
export function pdfFileName(moduleName: string): string {
  return `${moduleName.replace(/[\\/:*?"<>|]/g, '-')}.pdf`;
}

/** Le dossier de module d'une leçon : « module-1/lecon-2 » → « module-1 ». */
export function moduleDirOf(id: string): string {
  return id.split('/')[0];
}

/**
 * Le PDF résumé d'un module, s'il est là où il sera SERVI : dans
 * public/slides/modules/. Le vérifier dans slides/ ne prouverait rien - ce
 * dossier de travail n'est servi ni en dev ni au build. C'est
 * `npm run slides` qui alimente public/, et il réclame Chrome.
 */
function modulePdf(dir: string): string | null {
  return existsSync(join(process.cwd(), 'public/slides/modules', `${dir}.pdf`))
    ? `/slides/modules/${dir}.pdf`
    : null;
}

/**
 * Les modules du cours, dans l'ordre, chacun avec ses leçons dans l'ordre.
 *
 * Ordre des modules : `moduleOrder` s'il est renseigné, sinon alphabétique.
 * Les leçons verrouillées sont GARDÉES : le sommaire les annonce, grisées.
 * C'est à chaque page de décider ce qu'elle en fait.
 */
export async function getCourse(): Promise<CourseModule[]> {
  const all = await getCollection('lecons');

  const byModule = new Map<string, Lesson[]>();
  for (const lesson of all) {
    const arr = byModule.get(lesson.data.module) ?? [];
    arr.push(lesson);
    byModule.set(lesson.data.module, arr);
  }
  for (const arr of byModule.values()) {
    arr.sort((a, b) => a.data.order - b.data.order);
  }

  const sorted = [...byModule.entries()].sort((a, b) => {
    const oa = a[1][0].data.moduleOrder ?? Number.POSITIVE_INFINITY;
    const ob = b[1][0].data.moduleOrder ?? Number.POSITIVE_INFINITY;
    return oa !== ob ? oa - ob : a[0].localeCompare(b[0]);
  });

  return sorted.map(([name, lessons], index) => {
    const dir = moduleDirOf(lessons[0].id);
    return {
      name,
      shortName: shortModuleName(name),
      number: index + 1,
      dir,
      pdf: modulePdf(dir),
      lessons: lessons.map((entry, i) => {
        const locked = isLocked(entry.id);
        return {
          id: entry.id,
          title: entry.data.title,
          description: entry.data.description,
          position: i + 1,
          locked,
          url: locked ? null : `/lecons/${entry.id}/`,
          entry,
        };
      }),
    };
  });
}

/** Toutes les leçons OUVERTES, à plat, dans l'ordre du cours. */
export function openLessons(modules: CourseModule[]): CourseLesson[] {
  return modules.flatMap((m) => m.lessons).filter((l) => !l.locked);
}

/**
 * Le cours a-t-il des sources à montrer ? Seules comptent celles des leçons
 * OUVERTES : la page /sources/ ne doit pas révéler ce que cite une leçon
 * verrouillée, dont le contenu n'est pas en ligne.
 */
export function hasSources(modules: CourseModule[]): boolean {
  return openLessons(modules).some((lesson) => (lesson.entry.data.sources ?? []).length > 0);
}
