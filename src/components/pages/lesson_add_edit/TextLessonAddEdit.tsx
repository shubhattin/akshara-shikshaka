'use client';

type text_lesson_info_type = {
  id?: number;
  uuid?: string;
  lang_id: number;
  base_word_script_id: number;
  audio_id: number;
  text: string;
};

type text_lesson_word_type = {
  id: number;
  word: string;
  image_id: number;
  audio_id: number;
};

type Props =
  | {
      location: 'add';
      text_lesson_info: text_lesson_info_type;
      gesture_ids: number[]; // []
      words: text_lesson_word_type[]; // []
    }
  | {
      location: 'edit';
      text_lesson_info: text_lesson_info_type & {
        id: number;
        uuid: string;
      };
      gesture_ids: number[];
      words: text_lesson_word_type[];
    };

export default function TextLessonAddEdit({}: Props) {
  return (
    <div>
      <h1>Text Lesson Add Edit</h1>
    </div>
  );
}
