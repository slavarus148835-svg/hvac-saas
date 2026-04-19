"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { resolveAuthUser } from "@/lib/resolveAuthUser";

type SavedCalculation = {
  id: string;
  uid: string;
  createdAt: string;
  updatedAt?: string;
  capacity: string;
  total: number;
  clientName?: string;
  clientContact?: string;
  clientText: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU").format(Number(n || 0)) + " ₽";
}

function formatDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ru-RU");
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export default function CalculatorHistoryEmbed() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SavedCalculation[]>([]);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const router = useRouter();

  useEffect(() => {
    let unsubHistory: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, async (userFromObserver) => {
      const currentUser = await resolveAuthUser(userFromObserver);
      if (!currentUser) {
        router.push("/login");
        return;
      }

      const q = query(
        collection(db, "calculationHistory"),
        where("uid", "==", currentUser.uid)
      );

      unsubHistory = onSnapshot(
        q,
        (snapshot) => {
          const list = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SavedCalculation, "id">),
          }));

          list.sort((a, b) => {
            const aTime = new Date(a.updatedAt || a.createdAt).getTime();
            const bTime = new Date(b.updatedAt || b.createdAt).getTime();
            return bTime - aTime;
          });

          setItems(list);
          setLoading(false);
        },
        (error) => {
          console.error(error);
          setLoading(false);
          alert("Не удалось загрузить историю расчётов");
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubHistory) unsubHistory();
    };
  }, [router]);

  const filteredItems = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return items;

    return items.filter((item) => {
      const name = normalizeSearch(item.clientName || "");
      const contact = normalizeSearch(item.clientContact || "");
      const text = normalizeSearch(item.clientText || "");
      const capacity = normalizeSearch(item.capacity || "");
      const total = String(item.total || "");

      return (
        name.includes(q) ||
        contact.includes(q) ||
        text.includes(q) ||
        capacity.includes(q) ||
        total.includes(q)
      );
    });
  }, [items, search]);

  const handleDelete = async (id: string) => {
    const ok = window.confirm("Удалить этот расчёт?");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "calculationHistory", id));
    } catch (error: any) {
      alert("Ошибка удаления: " + error.message);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    alert("Текст расчёта скопирован");
  };

  const handleOpenInCalculator = (id: string) => {
    router.push(`/calculator?historyId=${id}`);
  };

  if (loading) {
    return <div style={loadingStyle}>Загрузка истории...</div>;
  }

  return (
    <div style={pageStyle}>
      <div style={heroCard}>
        <div style={heroLabel}>Все автосохранённые расчёты</div>
        <h1 style={heroTitle}>История расчётов</h1>
        <p style={heroText}>
          Можно искать по имени клиента, номеру, username и тексту расчёта.
        </p>
      </div>

      <div style={topButtons}>
        <button
          type="button"
          onClick={() => router.push("/calculator")}
          style={secondaryButton}
        >
          Вернуться в калькулятор
        </button>

        <button type="button" onClick={() => router.push("/dashboard")} style={secondaryButton}>
          Назад в кабинет
        </button>
      </div>

      <div style={searchCard}>
        <div style={searchLabel}>Поиск по истории</div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Введите имя клиента, номер, username или текст"
          style={searchInput}
        />
        <div style={smallText}>
          Найдено: {filteredItems.length}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div style={emptyCard}>
          {search.trim() ? "Ничего не найдено по этому запросу." : "Пока нет сохранённых расчётов."}
        </div>
      ) : (
        filteredItems.map((item) => {
          const opened = openedId === item.id;

          return (
            <div key={item.id} style={itemCard}>
              <div style={itemHead}>
                <div>
                  <div style={itemTitle}>
                    {item.clientName?.trim()
                      ? item.clientName
                      : "Клиент без имени"}{" "}
                    — кондиционер {item.capacity}
                  </div>

                  <div style={smallText}>
                    Контакт: {item.clientContact || "не указан"}
                  </div>

                  <div style={smallText}>
                    Обновлён: {formatDate(item.updatedAt || item.createdAt)}
                  </div>
                </div>

                <div style={priceBadge}>{fmt(item.total)}</div>
              </div>

              <div style={buttonRow}>
                <button
                  onClick={() => handleOpenInCalculator(item.id)}
                  style={secondaryButton}
                >
                  Открыть в калькуляторе
                </button>

                <button
                  onClick={() => setOpenedId(opened ? null : item.id)}
                  style={secondaryButton}
                >
                  {opened ? "Скрыть текст" : "Открыть текст"}
                </button>

                <button
                  onClick={() => handleCopy(item.clientText)}
                  style={secondaryButton}
                >
                  Копировать
                </button>

                <button
                  onClick={() => handleDelete(item.id)}
                  style={dangerButton}
                >
                  Удалить
                </button>
              </div>

              {opened ? (
                <textarea
                  value={item.clientText}
                  readOnly
                  style={textareaStyle}
                />
              ) : null}
            </div>
          );
        })
      )}
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
  maxWidth: "900px",
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

const topButtons: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "16px",
};

const searchCard: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "18px",
  padding: "16px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.05)",
  marginBottom: "16px",
};

const searchLabel: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  marginBottom: "8px",
};

const searchInput: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  fontSize: "16px",
  background: "#fff",
  marginBottom: "8px",
};

const emptyCard: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.05)",
};

const itemCard: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "18px",
  padding: "16px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.05)",
  marginBottom: "16px",
};

const itemHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "flex-start",
  marginBottom: "14px",
};

const itemTitle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 800,
  marginBottom: "6px",
};

const smallText: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b7280",
  lineHeight: 1.5,
};

const priceBadge: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: "12px",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "12px",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "220px",
  padding: "12px",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
  fontSize: "15px",
};

const secondaryButton: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: "15px",
  fontWeight: 600,
  cursor: "pointer",
};

const dangerButton: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: "14px",
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#b91c1c",
  fontSize: "15px",
  fontWeight: 700,
  cursor: "pointer",
};