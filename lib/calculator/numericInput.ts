import type React from "react";

/** Минимальный font-size для input/select/textarea (iOS не зумит при фокусе). */
export const CALCULATOR_FORM_CONTROL_FONT_SIZE_PX = 16;

export const calculatorFormControlStyle: React.CSSProperties = {
  fontSize: CALCULATOR_FORM_CONTROL_FONT_SIZE_PX,
};

/**
 * Если в поле было «0» и пользователь вводит цифру, заменить 0, а не дописать (05 → 5).
 * Десятичные: 0 + «.» / «,» → «0.» / «0,».
 */
export function normalizeNumericInputValue(current: string, next: string): string {
  const cur = String(current ?? "").trim();
  const nxt = String(next ?? "");
  if (cur !== "0") return nxt;
  if (nxt === "" || nxt === "0") return nxt;
  if (/^[1-9]$/.test(nxt)) return nxt;
  if (/^0[.,]/.test(nxt)) return nxt;
  if (/^0[1-9]/.test(nxt)) return nxt.slice(1);
  if (/^0+[1-9]/.test(nxt)) return nxt.replace(/^0+/, "") || "0";
  return nxt;
}

/** Пустое / только точка на blur → значение по умолчанию. */
export function numericInputBlurValue(
  value: string,
  emptyDefault = "0",
  isDecimal = false
): string {
  const t = String(value ?? "").trim();
  if (!t) return emptyDefault;
  if (isDecimal && (t === "." || t === ",")) return emptyDefault;
  return value;
}

export function handleZeroReplacingNumericFocus(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
): void {
  const el = e.currentTarget;
  if (String(el.value).trim() === "0") {
    requestAnimationFrame(() => el.select());
  }
}

export function handleZeroReplacingNumericChange(params: {
  previous: string;
  rawNext: string;
  sanitize: (raw: string) => string;
  onValue: (value: string) => void;
  emptyDefault?: string;
}): void {
  const normalized = normalizeNumericInputValue(params.previous, params.rawNext);
  const sanitized = params.sanitize(normalized);
  params.onValue(sanitized || (params.emptyDefault ?? "0"));
}

export function bindZeroReplacingNumericInput(params: {
  value: string;
  onChange: (value: string) => void;
  sanitize: (raw: string) => string;
  emptyDefault?: string;
  isDecimal?: boolean;
}): Pick<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "onFocus" | "onBlur"
> {
  const emptyDefault = params.emptyDefault ?? "0";
  return {
    onFocus: handleZeroReplacingNumericFocus,
    onChange: (e) => {
      handleZeroReplacingNumericChange({
        previous: params.value,
        rawNext: e.target.value,
        sanitize: params.sanitize,
        onValue: params.onChange,
        emptyDefault,
      });
    },
    onBlur: () => {
      const fixed = numericInputBlurValue(
        params.value,
        emptyDefault,
        params.isDecimal
      );
      if (fixed !== params.value) params.onChange(fixed);
    },
  };
}
