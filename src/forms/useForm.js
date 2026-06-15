import { useState, useCallback } from "react";
import { validateField, validateAll } from "./validation";

export function useForm(initial, rules, onSubmit) {
  const [values,  setValues_] = useState(initial);
  const [errors,  setErrors]  = useState({});
  const [hints,   setHints]   = useState({});
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState({ text: "", type: "" });

  const setValues = useCallback((patch) =>
    setValues_((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) })), []);

  const handleChange = useCallback((key, value) => {
    setValues_((prev) => ({ ...prev, [key]: value }));
    const r = validateField(value, rules[key]);
    setHints((p)  => ({ ...p, [key]: r.ok ? "" : r.msg }));
    setErrors((p) => ({ ...p, [key]: "" }));
    setMsg({ text: "", type: "" });
  }, [rules]);

  const handleBlur = useCallback((key, value) => {
    const r = validateField(value, rules[key]);
    setErrors((p) => ({ ...p, [key]: r.ok ? "" : r.msg }));
    setHints((p)  => ({ ...p, [key]: "" }));
  }, [rules]);

  const handleSubmit = useCallback(async () => {
    const { valid, errors: errs } = validateAll(values, rules);
    if (!valid) { setErrors(errs); return false; }
    setLoading(true);
    setMsg({ text: "", type: "" });
    try {
      const result = await onSubmit(values);
      if (result?.msg?.text) { setMsg(result.msg); return false; }
      return result?.ok ?? true;
    } catch (err) {
      setMsg({ text: err.message, type: "error" });
      return false;
    } finally {
      setLoading(false);
    }
  }, [values, rules, onSubmit]);

  const reset = useCallback(() => {
    setValues_(initial); setErrors({}); setHints({}); setMsg({ text: "", type: "" });
  }, [initial]);

  return { values, errors, hints, loading, msg, handleChange, handleBlur, handleSubmit, reset, setValues };
}
