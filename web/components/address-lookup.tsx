"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

const ADDRESS_RE = /^g1[02-9ac-hj-np-z]{38}$/;

export function AddressLookup() {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim().toLowerCase();
    if (!ADDRESS_RE.test(v)) {
      setError("Enter a gno.land address: g1 followed by 38 characters.");
      return;
    }
    setError(null);
    router.push(`/profile/${v}`);
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={id}>Address</label>
        <div className="form-row">
          <input
            id={id}
            className="input mono"
            placeholder="g1…"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
          />
          <button type="submit" className="btn">
            Open profile
          </button>
        </div>
        {error && (
          <p id={`${id}-err`} className="field-error">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
