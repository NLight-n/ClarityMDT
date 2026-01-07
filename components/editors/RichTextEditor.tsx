"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Button } from "@/components/ui/button";
import { useCallback, useMemo, useEffect } from "react";

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
  caseId,
  imageType,
}: RichTextEditorProps) {
  // Convert storageKey images to API endpoint URLs when loading content
  const processedContent = useMemo(() => {
    if (!content || !content.content) return content;
    
    const processNode = (node: any): any => {
      if (node.type === "image" && node.attrs?.storageKey) {
        // If image has storageKey, use streaming endpoint
        return {
          ...node,
          attrs: {
            ...node.attrs,
            src: `/api/images/stream/${node.attrs.storageKey}`,
          },
        };
      }
      
      if (node.content && Array.isArray(node.content)) {
        return {
          ...node,
          content: node.content.map(processNode),
        };
      }
      
      return node;
    };
    
    return {
      ...content,
      content: content.content.map(processNode),
    };
  }, [content]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            storageKey: {
              default: null,
              parseHTML: (element) => element.getAttribute("data-storage-key"),
              renderHTML: (attributes) => {
                if (!attributes.storageKey) {
                  return {};
                }
                return {
                  "data-storage-key": attributes.storageKey,
                };
              },
            },
          };
        },
      }).configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-lg my-2",
        },
      }),
    ],
    content: processedContent || {
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
        style: "line-height: 1;",
      },
    },
  });

  const handleImageUpload = useCallback(
    (file: File) => {
      if (!editor) return;

      const reader = new FileReader();

      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        // Insert image with base64 src (temporary, will be uploaded on save)
        editor.chain().focus().setImage({ src: base64 }).run();
      };

      reader.readAsDataURL(file);
    },
    [editor]
  );

  // Update editable state when prop changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
      // Focus the editor when it becomes editable
      if (editable) {
        // Use setTimeout to ensure the DOM is ready
        setTimeout(() => {
          editor.commands.focus();
        }, 0);
      }
    }
  }, [editor, editable]);

  // Update editor content when switching to view mode (editable becomes false)
  // This ensures saved content is displayed after canceling or saving
  useEffect(() => {
    if (editor && processedContent && !editable) {
      const currentContent = editor.getJSON();
      // Only update if content is different to avoid unnecessary updates
      if (JSON.stringify(currentContent) !== JSON.stringify(processedContent)) {
        editor.commands.setContent(processedContent);
      }
    }
  }, [editor, processedContent, editable]);

  // Handle paste events for images
  useEffect(() => {
    if (editor && editable) {
      editor.setOptions({
        editorProps: {
          ...editor.options.editorProps,
          handlePaste: (view, event) => {
            const items = event.clipboardData?.items;
            if (!items) return false;

            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (item.type.indexOf("image") !== -1) {
                event.preventDefault();
                const file = item.getAsFile();
                if (file) {
                  handleImageUpload(file);
                }
                return true;
              }
            }
            return false;
          },
        },
      });
    }
  }, [editor, editable, handleImageUpload]);

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
            • List
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
          <div className="w-px bg-gray-300" />
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            className="hidden"
            id={`image-upload-${caseId}-${imageType}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleImageUpload(file);
              }
              e.target.value = ""; // Reset input
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              document.getElementById(`image-upload-${caseId}-${imageType}`)?.click();
            }}
          >
            📷 Insert Image
          </Button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
