"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

interface RichTextEditorProps {
  content: any; // ProseMirror JSON
  onChange?: (json: any) => void;
  placeholder?: string;
  editable?: boolean;
  caseId: string;
  imageType: "radiology" | "pathology" | "clinical";
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Start typing...",
  editable = true,
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit],
    content: content || {
      type: "doc",
      content: [],
    },
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: "prose max-w-none focus:outline-none min-h-[200px] p-4",
        "data-placeholder": placeholder,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
    if (editable) {
      setTimeout(() => {
        editor.commands.focus();
      }, 0);
    }
  }, [editor, editable]);

  useEffect(() => {
    if (!editor || !content || editable) return;
    const currentContent = editor.getJSON();
    if (JSON.stringify(currentContent) !== JSON.stringify(content)) {
      editor.commands.setContent(content);
    }
  }, [editor, content, editable]);

  if (!editor) {
    return <div className="border rounded-lg p-4">Loading editor...</div>;
  }

  return (
    <div className="border rounded-lg bg-white">
      {editable && (
        <div className="border-b p-2 flex gap-2 flex-wrap bg-gray-50">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            className={editor.isActive("bold") ? "bg-gray-200" : ""}
          >
            <strong>B</strong>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            className={editor.isActive("italic") ? "bg-gray-200" : ""}
          >
            <em>I</em>
          </Button>
          <div className="w-px bg-gray-300" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive("bulletList") ? "bg-gray-200" : ""}
          >
            List
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive("orderedList") ? "bg-gray-200" : ""}
          >
            1. List
          </Button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
