"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  Timestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  customServiceFormRowsToPayload,
  newCustomServiceId,
  parseCustomServicesFromPriceDoc,
  type UserCustomService,
} from "@/lib/customServices";
import { PRICING_FS } from "@/lib/pricingFirestorePaths";
import { resolveAuthUser } from "@/lib/resolveAuthUser";

function getFirestoreErrorParts(e: unknown): { code: string; message: string } {
  if (typeof e === "object" && e !== null && "code" in e && "message" in e) {
    const code = String((e as { code: unknown }).code);
    const message = String((e as { message: unknown }).message);
    return { code, message };
  }
  if (e instanceof Error) return { code: "", message: e.message };
  return { code: "", message: String(e) };
}

function alertFirestoreModelWriteError(context: string, e: unknown): void {
  console.error(context, e);
  const { code, message } = getFirestoreErrorParts(e);
  let human = message;
  if (code === "permission-denied") human = "Нет доступа к базе";
  else if (code === "unauthenticated") human = "Вы не авторизованы";
  else if (code === "invalid-argument" || code === "failed-precondition") human = "Ошибка данных";
  alert(`${human}\n\nFirebase: ${code || "нет кода"}\n${message}`);
}

type PriceForm = {
  standard_7_9: string;
  standard_12: string;
  standard_18: string;
  standard_24: string;
  standard_30: string;
  standard_36: string;

  existing_7_9: string;
  existing_12: string;
  existing_18: string;
  existing_24: string;
  existing_30: string;
  existing_36: string;

  route_7_9: string;
  route_12: string;
  route_18: string;
  route_24: string;
  route_30: string;
  route_36: string;

  baseArmConcreteSurcharge: string;
  extraHoleNormal: string;
  extraHoleArm: string;

  stroba_brick_small: string;
  stroba_brick_big: string;
  stroba_concrete_small: string;
  stroba_concrete_big: string;

  cable40: string;
  cable16: string;

  bracketsAndFasteners: string;
  dismantlingOldUnit: string;
  glassUnitWork: string;
  facadeTileCut: string;
  drainageToGutter: string;
  drainPumpInstall: string;
  outdoorConnectionLadder: string;
  floorCarryTools: string;
  outdoorBlockCarry: string;
};

const defaultForm: PriceForm = {
  standard_7_9: "5900",
  standard_12: "6900",
  standard_18: "7900",
  standard_24: "9500",
  standard_30: "10500",
  standard_36: "11500",

  existing_7_9: "6900",
  existing_12: "7900",
  existing_18: "8900",
  existing_24: "10500",
  existing_30: "11500",
  existing_36: "12500",

  route_7_9: "2000",
  route_12: "2200",
  route_18: "2200",
  route_24: "2700",
  route_30: "2700",
  route_36: "2900",

  baseArmConcreteSurcharge: "4000",
  extraHoleNormal: "1000",
  extraHoleArm: "5000",

  stroba_brick_small: "1000",
  stroba_brick_big: "1200",
  stroba_concrete_small: "1500",
  stroba_concrete_big: "1600",

  cable40: "600",
  cable16: "200",

  bracketsAndFasteners: "1000",
  dismantlingOldUnit: "3500",
  glassUnitWork: "1000",
  facadeTileCut: "1300",
  drainageToGutter: "200",
  drainPumpInstall: "3000",
  outdoorConnectionLadder: "500",
  floorCarryTools: "500",
  outdoorBlockCarry: "1000",
};

function mergePriceFormFromFirestore(
  data: Record<string, unknown> | undefined
): PriceForm {
  const base = { ...defaultForm };
  if (!data || typeof data !== "object") return base;
  (Object.keys(defaultForm) as (keyof PriceForm)[]).forEach((key) => {
    const raw = data[key as string];
    if (raw == null) return;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      base[key] = String(Math.max(0, Math.floor(raw)));
      return;
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed === "") return;
      const n = Number(trimmed.replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(n)) base[key] = String(Math.max(0, Math.floor(n)));
      else base[key] = trimmed;
    }
  });
  return base;
}

function PriceField({
  label,
  note,
  value,
  onChange,
  suffix = "₽",
}: {
  label: string;
  note: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
}) {
  return (
    <div style={fieldWrapStyle}>
      <div style={{ flex: 1 }}>
        <div style={fieldLabelStyle}>{label}</div>
        <div style={smallTextStyle}>{note}</div>
      </div>

      <div style={priceInputWrapStyle}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={smallInputStyle}
          inputMode="numeric"
        />
        <span style={suffixStyle}>{suffix}</span>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={cardStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {subtitle ? <div style={{ ...smallTextStyle, marginBottom: 12 }}>{subtitle}</div> : null}
      {children}
    </div>
  );
}

type AcModelRow = { id: string; name: string; price: string };
type CustomServiceRow = { id: string; name: string; price: string };

export default function CalculatorPricingEmbed() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<PriceForm>(defaultForm);
  const [giftRouteMetersStr, setGiftRouteMetersStr] = useState("1");
  const [acModels, setAcModels] = useState<AcModelRow[]>([]);
  const [newModelName, setNewModelName] = useState("");
  const [newModelPrice, setNewModelPrice] = useState("");
  const [modelsBusy, setModelsBusy] = useState(false);

  const [customServices, setCustomServices] = useState<CustomServiceRow[]>([]);
  const [newCustomName, setNewCustomName] = useState("");
  const [newCustomPrice, setNewCustomPrice] = useState("");
  const [customBusy, setCustomBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userFromObserver) => {
      const currentUser = await resolveAuthUser(userFromObserver);
      if (!currentUser) {
        router.push("/login");
        return;
      }

      setUid(currentUser.uid);
      const uid = currentUser.uid;

      try {
        try {
          await currentUser.getIdToken(true);
        } catch (tok) {
          console.warn("[pricing] token refresh before load", tok);
        }

        try {
          const userSnap = await getDoc(doc(db, PRICING_FS.users, uid));
          if (userSnap.exists()) {
            const g = Number((userSnap.data() as { giftRouteMeters?: unknown }).giftRouteMeters);
            setGiftRouteMetersStr(
              String(Number.isFinite(g) && g >= 0 ? Math.floor(g) : 1)
            );
          } else {
            setGiftRouteMetersStr("1");
          }
        } catch (e) {
          console.error("[pricing] users/{uid} read failed", e);
          setGiftRouteMetersStr("1");
        }

        let rows: AcModelRow[] = [];
        try {
          const modelsSnap = await getDocs(
            collection(db, PRICING_FS.users, uid, PRICING_FS.modelsSubcollection)
          );
          rows = modelsSnap.docs.map((d) => {
            const x = d.data() as { name?: unknown; price?: unknown };
            const priceRaw = x.price;
            const priceNum =
              typeof priceRaw === "number"
                ? priceRaw
                : typeof priceRaw === "string"
                  ? Number(priceRaw.replace(/\D/g, ""))
                  : NaN;
            return {
              id: d.id,
              name: String(x.name ?? ""),
              price: Number.isFinite(priceNum) ? String(Math.max(0, Math.floor(priceNum))) : "",
            };
          });
          rows.sort((a, b) => a.name.localeCompare(b.name, "ru"));
        } catch (modelsErr) {
          console.error("[pricing] models load failed", modelsErr);
          rows = [];
        }
        setAcModels(rows);

        try {
          const priceSnap = await getDoc(doc(db, PRICING_FS.priceLists, uid));
          if (priceSnap.exists()) {
            const pdata = priceSnap.data() as Record<string, unknown>;
            setForm(mergePriceFormFromFirestore(pdata));
            const parsed = parseCustomServicesFromPriceDoc(pdata.customServices);
            setCustomServices(
              parsed.map((s) => ({
                id: s.id,
                name: s.name,
                price: String(s.price),
              }))
            );
          } else {
            setForm({ ...defaultForm });
            setCustomServices([]);
          }
        } catch (e) {
          console.error("[pricing] priceLists read failed", e);
          setForm({ ...defaultForm });
          setCustomServices([]);
        }
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const updateField = (key: keyof PriceForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    try {
      const owner = auth.currentUser;
      if (!owner?.uid) {
        alert("Вы не авторизованы. Войдите снова и сохраните прайс.");
        console.error("[pricing] save: no auth.currentUser");
        return;
      }

      try {
        await owner.getIdToken(true);
      } catch (tok) {
        console.warn("[pricing] token refresh before save", tok);
      }

      const gift = Math.max(
        0,
        Math.floor(Number(String(giftRouteMetersStr).replace(/\D/g, "") || 0))
      );
      await setDoc(
        doc(db, PRICING_FS.users, owner.uid),
        {
          uid: owner.uid,
          giftRouteMeters: gift,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      const customPayload = customServiceFormRowsToPayload(customServices);

      await setDoc(
        doc(db, PRICING_FS.priceLists, owner.uid),
        {
          ...Object.fromEntries(
            Object.entries(form).map(([key, value]) => [key, Number(value || 0)])
          ),
          customServices: customPayload,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      alert("Прайс сохранён");
      window.dispatchEvent(new CustomEvent("hvac-pricelist-saved"));
    } catch (error: unknown) {
      console.error("[pricing] save failed", error);
      const err = error as { code?: string; message?: string };
      const code = typeof err.code === "string" ? err.code : "";
      const msg = typeof err.message === "string" ? err.message : String(error);
      if (code === "permission-denied") {
        alert("Нет доступа к сохранению. Обновите страницу и войдите снова.\n\nFirebase: " + code);
      } else if (code === "unauthenticated") {
        alert("Сессия истекла. Войдите снова.\n\nFirebase: " + code);
      } else {
        alert("Ошибка сохранения: " + msg + (code ? "\n\nFirebase: " + code : ""));
      }
    }
  };

  const saveModelRow = async (row: AcModelRow) => {
    const owner = auth.currentUser;
    if (!owner?.uid) {
      alert("Вы не авторизованы. Войдите в аккаунт и попробуйте снова.");
      return;
    }
    try {
      await owner.getIdToken(true);
    } catch (tok) {
      console.warn("[pricing] token refresh before model save", tok);
    }
    const p = Math.max(0, Math.floor(Number(String(row.price || "").replace(/\D/g, "") || 0)));
    if (!Number.isFinite(p)) {
      alert("Ошибка данных: некорректная цена");
      return;
    }
    try {
      await updateDoc(
        doc(db, PRICING_FS.users, owner.uid, PRICING_FS.modelsSubcollection, row.id),
        {
          name: row.name.trim(),
          price: p,
          updatedAt: Timestamp.now(),
        }
      );
    } catch (e) {
      alertFirestoreModelWriteError("[pricing] save model", e);
    }
  };

  const deleteModelRow = async (id: string) => {
    const owner = auth.currentUser;
    if (!owner?.uid) {
      alert("Вы не авторизованы. Войдите в аккаунт и попробуйте снова.");
      return;
    }
    try {
      await owner.getIdToken(true);
    } catch (tok) {
      console.warn("[pricing] token refresh before model delete", tok);
    }
    try {
      await deleteDoc(doc(db, PRICING_FS.users, owner.uid, PRICING_FS.modelsSubcollection, id));
      setAcModels((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      alertFirestoreModelWriteError("[pricing] delete model", e);
    }
  };

  const handleAddModel = async () => {
    await auth.authStateReady();
    const owner = auth.currentUser;
    if (!owner?.uid) {
      alert("Вы не авторизованы. Войдите в аккаунт и попробуйте снова.");
      console.error("[pricing] add model: no auth.currentUser after authStateReady");
      return;
    }
    if (!newModelName.trim()) {
      alert("Введите название модели");
      return;
    }
    const p = Math.max(0, Math.floor(Number(newModelPrice.replace(/\D/g, "") || 0)));
    if (!Number.isFinite(p) || p <= 0) {
      alert("Введите цену больше 0");
      return;
    }
    setModelsBusy(true);
    try {
      try {
        await owner.getIdToken(true);
      } catch (tokErr) {
        console.warn("[pricing] add model: token refresh", tokErr);
      }

      await setDoc(
        doc(db, PRICING_FS.users, owner.uid),
        {
          uid: owner.uid,
          email: owner.email || "",
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      const colRef = collection(db, PRICING_FS.users, owner.uid, PRICING_FS.modelsSubcollection);
      let newId: string;
      try {
        const ref = await addDoc(colRef, {
          name: newModelName.trim(),
          price: p,
          createdAt: Timestamp.now(),
        });
        newId = ref.id;
      } catch (addErr) {
        console.error("[pricing] addDoc failed, fallback setDoc", addErr);
        const modelRef = doc(colRef);
        newId = modelRef.id;
        await setDoc(modelRef, {
          name: newModelName.trim(),
          price: p,
          createdAt: Timestamp.now(),
        });
      }

      setAcModels((prev) =>
        [...prev, { id: newId, name: newModelName.trim(), price: String(p) }].sort((a, b) =>
          a.name.localeCompare(b.name, "ru")
        )
      );
      setNewModelName("");
      setNewModelPrice("");
    } catch (e) {
      alertFirestoreModelWriteError("[pricing] add model", e);
    } finally {
      setModelsBusy(false);
    }
  };

  async function persistCustomServicesOnly(rows: CustomServiceRow[]) {
    const owner = auth.currentUser;
    if (!owner?.uid) {
      alert("Вы не авторизованы.");
      return;
    }
    try {
      await owner.getIdToken(true);
    } catch (tok) {
      console.warn("[pricing] token refresh before custom services", tok);
    }
    const payload = customServiceFormRowsToPayload(rows);
    try {
      await setDoc(
        doc(db, PRICING_FS.priceLists, owner.uid),
        {
          customServices: payload,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      window.dispatchEvent(new CustomEvent("hvac-pricelist-saved"));
    } catch (e) {
      alertFirestoreModelWriteError("[pricing] save custom services", e);
    }
  }

  const saveCustomRow = async (id: string) => {
    const row = customServices.find((x) => x.id === id);
    if (!row) return;
    const p = Math.max(0, Math.floor(Number(String(row.price || "").replace(/\D/g, "") || 0)));
    if (!String(row.name || "").trim()) {
      alert("Введите название услуги");
      return;
    }
    if (!Number.isFinite(p) || p <= 0) {
      alert("Введите цену больше 0");
      return;
    }
    const next = customServices.map((x) => (x.id === id ? { ...x, price: String(p) } : x));
    setCustomServices(next);
    await persistCustomServicesOnly(next);
  };

  const deleteCustomRow = async (id: string) => {
    const next = customServices.filter((x) => x.id !== id);
    setCustomServices(next);
    await persistCustomServicesOnly(next);
  };

  const handleAddCustomService = async () => {
    await auth.authStateReady();
    const owner = auth.currentUser;
    if (!owner?.uid) {
      alert("Вы не авторизованы.");
      return;
    }
    if (!newCustomName.trim()) {
      alert("Введите название услуги");
      return;
    }
    const p = Math.max(0, Math.floor(Number(newCustomPrice.replace(/\D/g, "") || 0)));
    if (!Number.isFinite(p) || p <= 0) {
      alert("Введите цену больше 0");
      return;
    }
    setCustomBusy(true);
    try {
      const newId = newCustomServiceId();
      const next = [
        ...customServices,
        { id: newId, name: newCustomName.trim(), price: String(p) },
      ].sort((a, b) => a.name.localeCompare(b.name, "ru"));
      setCustomServices(next);
      await persistCustomServicesOnly(next);
      setNewCustomName("");
      setNewCustomPrice("");
    } finally {
      setCustomBusy(false);
    }
  };

  if (loading) {
    return <div style={loadingStyle}>Загрузка прайса...</div>;
  }

  return (
    <div style={pageStyle}>
      <div style={heroCard}>
        <div style={heroLabel}>Настройка личных цен</div>
        <h1 style={heroTitle}>Личный прайс</h1>
        <p style={heroText}>
          Все цены ниже использует калькулятор. Указывай свои реальные значения.
        </p>
      </div>

      <Section
        title="Метры трассы в подарок"
        subtitle="В калькуляторе: к оплате max(0, введённые метры − это значение)"
      >
        <div style={fieldWrapStyle}>
          <div style={{ flex: 1 }}>
            <div style={fieldLabelStyle}>Подарок, м</div>
            <div style={smallTextStyle}>Целое число ≥ 0, сохраняется вместе с прайсом</div>
          </div>
          <input
            value={giftRouteMetersStr}
            onChange={(e) => setGiftRouteMetersStr(e.target.value.replace(/\D/g, ""))}
            style={{ ...smallInputStyle, width: 120 }}
            inputMode="numeric"
          />
        </div>
      </Section>

      <Section title="Модели кондиционеров" subtitle="Название и цена — в расчёт при выборе модели">
        <div style={addModelCardStyle}>
          <input
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
            placeholder="Название модели"
            style={{ ...smallInputStyle, width: "100%", boxSizing: "border-box" }}
          />
          <div style={addModelRowStyle}>
            <input
              value={newModelPrice}
              onChange={(e) => setNewModelPrice(e.target.value.replace(/\D/g, ""))}
              placeholder="Цена, ₽"
              style={{ ...smallInputStyle, flex: "1 1 120px", minWidth: 0, maxWidth: "100%" }}
              inputMode="numeric"
            />
            <button
              type="button"
              disabled={modelsBusy}
              onClick={() => void handleAddModel()}
              style={{ ...primaryButtonStyle, flex: "1 1 160px", minWidth: 0 }}
            >
              Добавить модель
            </button>
          </div>
        </div>
        {acModels.length === 0 ? (
          <div style={smallTextStyle}>Моделей пока нет.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {acModels.map((row) => (
              <div key={row.id} style={acModelCardStyle}>
                <div style={modelFieldBlockStyle}>
                  <div style={modelMiniLabel}>Название</div>
                  <input
                    value={row.name}
                    onChange={(e) =>
                      setAcModels((prev) =>
                        prev.map((x) => (x.id === row.id ? { ...x, name: e.target.value } : x))
                      )
                    }
                    placeholder="Название модели"
                    style={modelNameInputStyle}
                  />
                </div>
                <div style={modelPriceActionsStyle}>
                  <div style={modelPriceBlockStyle}>
                    <div style={modelMiniLabel}>Цена, ₽</div>
                    <input
                      value={row.price}
                      onChange={(e) =>
                        setAcModels((prev) =>
                          prev.map((x) =>
                            x.id === row.id ? { ...x, price: e.target.value.replace(/\D/g, "") } : x
                          )
                        )
                      }
                      style={modelPriceInputStyle}
                      inputMode="numeric"
                    />
                  </div>
                  <div style={modelButtonsStyle}>
                    <button
                      type="button"
                      onClick={() => void saveModelRow(row)}
                      style={{ ...secondaryButtonStyle, flex: "1 1 120px" }}
                    >
                      Сохранить
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteModelRow(row.id)}
                      style={{ ...secondaryButtonStyle, flex: "1 1 120px" }}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Свои услуги"
        subtitle="Добавьте позиции с названием и ценой — они сохраняются в личном прайсе и доступны в калькуляторе"
      >
        <div style={addModelCardStyle}>
          <input
            value={newCustomName}
            onChange={(e) => setNewCustomName(e.target.value)}
            placeholder="Название услуги"
            style={{ ...smallInputStyle, width: "100%", boxSizing: "border-box" }}
          />
          <div style={addModelRowStyle}>
            <input
              value={newCustomPrice}
              onChange={(e) => setNewCustomPrice(e.target.value.replace(/\D/g, ""))}
              placeholder="Цена, ₽"
              style={{ ...smallInputStyle, flex: "1 1 120px", minWidth: 0, maxWidth: "100%" }}
              inputMode="numeric"
            />
            <button
              type="button"
              disabled={customBusy}
              onClick={() => void handleAddCustomService()}
              style={{ ...primaryButtonStyle, flex: "1 1 160px", minWidth: 0 }}
            >
              Добавить услугу
            </button>
          </div>
        </div>
        {customServices.length === 0 ? (
          <div style={smallTextStyle}>Пока нет своих услуг.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {customServices.map((row) => (
              <div key={row.id} style={acModelCardStyle}>
                <div style={modelFieldBlockStyle}>
                  <div style={modelMiniLabel}>Название</div>
                  <input
                    value={row.name}
                    onChange={(e) =>
                      setCustomServices((prev) =>
                        prev.map((x) => (x.id === row.id ? { ...x, name: e.target.value } : x))
                      )
                    }
                    placeholder="Название услуги"
                    style={modelNameInputStyle}
                  />
                </div>
                <div style={modelPriceActionsStyle}>
                  <div style={modelPriceBlockStyle}>
                    <div style={modelMiniLabel}>Цена, ₽</div>
                    <input
                      value={row.price}
                      onChange={(e) =>
                        setCustomServices((prev) =>
                          prev.map((x) =>
                            x.id === row.id ? { ...x, price: e.target.value.replace(/\D/g, "") } : x
                          )
                        )
                      }
                      style={modelPriceInputStyle}
                      inputMode="numeric"
                    />
                  </div>
                  <div style={modelButtonsStyle}>
                    <button
                      type="button"
                      onClick={() => void saveCustomRow(row.id)}
                      style={{ ...secondaryButtonStyle, flex: "1 1 120px" }}
                    >
                      Сохранить
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteCustomRow(row.id)}
                      style={{ ...secondaryButtonStyle, flex: "1 1 120px" }}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Монтаж на нашу трассу"
        subtitle="Базовая стоимость стандартного монтажа на вашу трассу"
      >
        <PriceField
          label="Мощность 7–9"
          note="Цена за 1 монтаж"
          value={form.standard_7_9}
          onChange={(v) => updateField("standard_7_9", v)}
        />
        <PriceField
          label="Мощность 12"
          note="Цена за 1 монтаж"
          value={form.standard_12}
          onChange={(v) => updateField("standard_12", v)}
        />
        <PriceField
          label="Мощность 18"
          note="Цена за 1 монтаж"
          value={form.standard_18}
          onChange={(v) => updateField("standard_18", v)}
        />
        <PriceField
          label="Мощность 24"
          note="Цена за 1 монтаж"
          value={form.standard_24}
          onChange={(v) => updateField("standard_24", v)}
        />
        <PriceField
          label="Мощность 30"
          note="Цена за 1 монтаж"
          value={form.standard_30}
          onChange={(v) => updateField("standard_30", v)}
        />
        <PriceField
          label="Мощность 36"
          note="Цена за 1 монтаж"
          value={form.standard_36}
          onChange={(v) => updateField("standard_36", v)}
        />
      </Section>

      <Section
        title="Монтаж на чужую трассу"
        subtitle="Базовая стоимость монтажа на уже готовую трассу"
      >
        <PriceField
          label="Мощность 7–9"
          note="Цена за 1 монтаж"
          value={form.existing_7_9}
          onChange={(v) => updateField("existing_7_9", v)}
        />
        <PriceField
          label="Мощность 12"
          note="Цена за 1 монтаж"
          value={form.existing_12}
          onChange={(v) => updateField("existing_12", v)}
        />
        <PriceField
          label="Мощность 18"
          note="Цена за 1 монтаж"
          value={form.existing_18}
          onChange={(v) => updateField("existing_18", v)}
        />
        <PriceField
          label="Мощность 24"
          note="Цена за 1 монтаж"
          value={form.existing_24}
          onChange={(v) => updateField("existing_24", v)}
        />
        <PriceField
          label="Мощность 30"
          note="Цена за 1 монтаж"
          value={form.existing_30}
          onChange={(v) => updateField("existing_30", v)}
        />
        <PriceField
          label="Мощность 36"
          note="Цена за 1 монтаж"
          value={form.existing_36}
          onChange={(v) => updateField("existing_36", v)}
        />
      </Section>

      <Section
        title="Трасса за метр"
        subtitle="Цена 1 метра трассы по мощности кондиционера"
      >
        <PriceField
          label="Трасса 7–9"
          note="Цена за 1 метр"
          value={form.route_7_9}
          onChange={(v) => updateField("route_7_9", v)}
          suffix="₽/м"
        />
        <PriceField
          label="Трасса 12"
          note="Цена за 1 метр"
          value={form.route_12}
          onChange={(v) => updateField("route_12", v)}
          suffix="₽/м"
        />
        <PriceField
          label="Трасса 18"
          note="Цена за 1 метр"
          value={form.route_18}
          onChange={(v) => updateField("route_18", v)}
          suffix="₽/м"
        />
        <PriceField
          label="Трасса 24"
          note="Цена за 1 метр"
          value={form.route_24}
          onChange={(v) => updateField("route_24", v)}
          suffix="₽/м"
        />
        <PriceField
          label="Трасса 30"
          note="Цена за 1 метр"
          value={form.route_30}
          onChange={(v) => updateField("route_30", v)}
          suffix="₽/м"
        />
        <PriceField
          label="Трасса 36"
          note="Цена за 1 метр"
          value={form.route_36}
          onChange={(v) => updateField("route_36", v)}
          suffix="₽/м"
        />
      </Section>

      <Section
        title="Отверстия"
        subtitle="Цены за отверстия и доплаты по бетону"
      >
        <PriceField
          label="Основное отверстие в армированном бетоне"
          note="Цена за 1 отверстие"
          value={form.baseArmConcreteSurcharge}
          onChange={(v) => updateField("baseArmConcreteSurcharge", v)}
        />
        <PriceField
          label="Доп. отверстие обычное"
          note="Цена за 1 отверстие"
          value={form.extraHoleNormal}
          onChange={(v) => updateField("extraHoleNormal", v)}
        />
        <PriceField
          label="Доп. отверстие армированный бетон"
          note="Цена за 1 отверстие"
          value={form.extraHoleArm}
          onChange={(v) => updateField("extraHoleArm", v)}
        />
      </Section>

      <Section
        title="Штроба"
        subtitle="Цена за 1 метр штробы по материалу и мощности"
      >
        <PriceField
          label="Кирпич / газоблок до 24 мощности"
          note="Цена за 1 метр"
          value={form.stroba_brick_small}
          onChange={(v) => updateField("stroba_brick_small", v)}
          suffix="₽/м"
        />
        <PriceField
          label="Кирпич / газоблок от 30 мощности"
          note="Цена за 1 метр"
          value={form.stroba_brick_big}
          onChange={(v) => updateField("stroba_brick_big", v)}
          suffix="₽/м"
        />
        <PriceField
          label="Бетон до 24 мощности"
          note="Цена за 1 метр"
          value={form.stroba_concrete_small}
          onChange={(v) => updateField("stroba_concrete_small", v)}
          suffix="₽/м"
        />
        <PriceField
          label="Бетон от 30 мощности"
          note="Цена за 1 метр"
          value={form.stroba_concrete_big}
          onChange={(v) => updateField("stroba_concrete_big", v)}
          suffix="₽/м"
        />
      </Section>

      <Section
        title="Кабель-каналы"
        subtitle="Цена за 1 метр кабель-канала"
      >
        <PriceField
          label="Кабель-канал 40×40"
          note="Цена за 1 метр"
          value={form.cable40}
          onChange={(v) => updateField("cable40", v)}
          suffix="₽/м"
        />
        <PriceField
          label="Кабель-канал 16×16"
          note="Цена за 1 метр"
          value={form.cable16}
          onChange={(v) => updateField("cable16", v)}
          suffix="₽/м"
        />
      </Section>

      <Section
        title="Дополнительные работы"
        subtitle="Фиксированные цены за одну услугу или единицу"
      >
        <PriceField
          label="Кронштейны и крепежи"
          note="Цена за 1 комплект"
          value={form.bracketsAndFasteners}
          onChange={(v) => updateField("bracketsAndFasteners", v)}
        />
        <PriceField
          label="Демонтаж"
          note="Цена за 1 услугу"
          value={form.dismantlingOldUnit}
          onChange={(v) => updateField("dismantlingOldUnit", v)}
        />
        <PriceField
          label="Демонтаж / монтаж стеклопакета"
          note="Цена за 1 услугу"
          value={form.glassUnitWork}
          onChange={(v) => updateField("glassUnitWork", v)}
        />
        <PriceField
          label="Резка фасадной плитки"
          note="Цена за 1 услугу"
          value={form.facadeTileCut}
          onChange={(v) => updateField("facadeTileCut", v)}
        />
        <PriceField
          label="Дренаж в водосток"
          note="Цена за 1 услугу"
          value={form.drainageToGutter}
          onChange={(v) => updateField("drainageToGutter", v)}
        />
        <PriceField
          label="Монтаж дренажной помпы"
          note="Цена за 1 услугу"
          value={form.drainPumpInstall}
          onChange={(v) => updateField("drainPumpInstall", v)}
        />
        <PriceField
          label="Подключение внешнего блока на лестнице"
          note="Цена за 1 услугу"
          value={form.outdoorConnectionLadder}
          onChange={(v) => updateField("outdoorConnectionLadder", v)}
        />
        <PriceField
          label="Подъём инструмента пешком"
          note="Цена за 1 этаж"
          value={form.floorCarryTools}
          onChange={(v) => updateField("floorCarryTools", v)}
        />
        <PriceField
          label="Подъём внешнего блока"
          note="Цена за 1 блок"
          value={form.outdoorBlockCarry}
          onChange={(v) => updateField("outdoorBlockCarry", v)}
        />
      </Section>

      <div style={buttonGridStyle}>
        <button onClick={handleSave} style={primaryButtonStyle}>
          Сохранить прайс
        </button>

        <button
          type="button"
          onClick={() => router.push("/calculator")}
          style={secondaryButtonStyle}
        >
          Вернуться в калькулятор
        </button>

        <button
          onClick={() => router.push("/dashboard")}
          style={secondaryButtonStyle}
        >
          Назад в кабинет
        </button>
      </div>
    </div>
  );
}

const loadingStyle: React.CSSProperties = {
  minHeight: "120px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f4f6f8",
  fontSize: "16px",
  borderRadius: "14px",
};

const pageStyle: React.CSSProperties = {
  background: "#f4f6f8",
  padding: "12px",
  maxWidth: "980px",
  margin: "0 auto",
  borderRadius: "18px",
};

const heroCard: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "18px",
  padding: "18px",
  marginBottom: "16px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.05)",
};

const heroLabel: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b7280",
  marginBottom: "6px",
};

const heroTitle: React.CSSProperties = {
  margin: 0,
  fontSize: "28px",
  lineHeight: 1.1,
  marginBottom: "8px",
};

const heroText: React.CSSProperties = {
  margin: 0,
  color: "#6b7280",
  fontSize: "14px",
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "18px",
  padding: "16px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.05)",
  marginBottom: "16px",
};

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "14px",
  fontSize: "20px",
};

const fieldWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: "14px",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 0",
  borderTop: "1px solid #eef1f4",
};

const fieldLabelStyle: React.CSSProperties = {
  marginBottom: "6px",
  fontWeight: 700,
  fontSize: "14px",
};

const smallTextStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b7280",
  lineHeight: 1.4,
};

const priceInputWrapStyle: React.CSSProperties = {
  minWidth: "140px",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const smallInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  fontSize: "16px",
  background: "#fff",
};

const suffixStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
  minWidth: "42px",
};

const buttonGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
  marginBottom: "30px",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: "14px",
  border: "none",
  background: "#111827",
  color: "#fff",
  fontSize: "15px",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: "15px",
  fontWeight: 600,
  cursor: "pointer",
};

const addModelCardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginBottom: 16,
  padding: 12,
  borderRadius: 14,
  border: "1px solid #eef1f4",
  background: "#fafbfc",
  boxSizing: "border-box",
};

const addModelRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "stretch",
  width: "100%",
};

const acModelCardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 14,
  background: "#fafbfc",
  boxSizing: "border-box",
  width: "100%",
  maxWidth: "100%",
};

const modelFieldBlockStyle: React.CSSProperties = {
  marginBottom: 12,
  width: "100%",
};

const modelMiniLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  marginBottom: 6,
};

const modelNameInputStyle: React.CSSProperties = {
  ...smallInputStyle,
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  wordBreak: "break-word",
  minHeight: 44,
};

const modelPriceActionsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "flex-end",
  justifyContent: "space-between",
};

const modelPriceBlockStyle: React.CSSProperties = {
  flex: "1 1 160px",
  minWidth: 0,
  maxWidth: "100%",
};

const modelPriceInputStyle: React.CSSProperties = {
  ...smallInputStyle,
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
};

const modelButtonsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  flex: "1 1 200px",
  justifyContent: "flex-start",
  minWidth: 0,
};
