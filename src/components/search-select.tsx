"use client";
import { useId, useState } from "react";
export type SelectOption = {
  value: string;
  label: string;
  description?: string;
};
export function SearchSelect({
  label,
  value,
  onChange,
  options,
  fallbackValue,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  fallbackValue?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [index, setIndex] = useState(0);
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replaceAll("đ", "d")
      .toLowerCase();
  const visible = options.filter((o) =>
    fold(o.label + " " + (o.description ?? "")).includes(fold(query)),
  );
  const selected = options.find((o) => o.value === value);
  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };
  return (
    <div
      className="search-select"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-autocomplete="list"
        aria-activedescendant={
          open && visible[index] ? `${id}-${index}` : undefined
        }
        value={open ? query : (selected?.label ?? "")}
        placeholder="Tìm kiếm và chọn…"
        onFocus={() => {
          setQuery("");
          setIndex(0);
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setIndex((i) =>
              Math.max(
                0,
                Math.min(
                  visible.length - 1,
                  i + (e.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            if (visible[index]) choose(visible[index].value);
            else if (fallbackValue !== undefined) choose(fallbackValue);
          }
        }}
      />
      {open && (
        <div
          role="listbox"
          id={id}
          aria-label={`Lựa chọn ${label}`}
          className="search-select-options"
        >
          {visible.map((o, i) => (
            <button
              role="option"
              aria-selected={value === o.value}
              id={`${id}-${i}`}
              type="button"
              key={o.value}
              className={index === i ? "highlight" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o.value)}
            >
              {o.label}
              {o.description && <small>{o.description}</small>}
            </button>
          ))}
          {!visible.length && (
            <div className="select-empty">
              Không tìm thấy lựa chọn.
              {fallbackValue !== undefined && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(fallbackValue)}
                >
                  Tự nhận diện chuyên ngành
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
