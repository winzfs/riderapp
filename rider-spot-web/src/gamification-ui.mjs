import { riderDayResult, riderProgress } from "./gamification.mjs";

// Optional, presentation-only components. No hooks, dialogs, route collection,
// networking or timers: they cannot interfere with an active delivery ride.
export function createGamificationUI(React) {
  const h = React.createElement;
  const km = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
  const amount = (value) => km.format(Math.max(0, Number(value) || 0));
  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const recapDate = (day) => {
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
    const date = new Date(day + "T12:00:00+09:00");
    return Number.isNaN(date.getTime()) ? "" : dateLabel.format(date);
  };

  function Medal({ badge, small = false }) {
    return h("span", {
      className: "rs-game-medal rs-game-medal-" + badge.tone +
        (badge.unlocked ? "" : " rs-game-medal-locked") +
        (small ? " rs-game-medal-small" : ""),
      "aria-hidden": true,
    }, badge.icon);
  }

  function RiderProgressCard({ history, userId }) {
    const progress = riderProgress(history);
    const key = "riderspot:profile-badge:v1:" + (userId || "guest");
    const [chosen, setChosen] = React.useState(() => {
      try { return window.localStorage.getItem(key) || ""; } catch { return ""; }
    });
    React.useEffect(() => {
      try { setChosen(window.localStorage.getItem(key) || ""); } catch { setChosen(""); }
    }, [key]);
    const chosenBadge = progress.badges.find(b => b.id === chosen && b.unlocked);
    const selectBadge = id => {
      setChosen(id);
      try { if (id) window.localStorage.setItem(key, id); else window.localStorage.removeItem(key); } catch {}
    };
    return h("section", {
      className: "rs-game-profile" + (chosenBadge ? " rs-game-profile-featured" : ""),
      "aria-label": "내 라이더 성장 기록",
    },
      h("div", { className: "rs-game-profile-top" },
        h("div", { className: "rs-game-level-disc", "aria-hidden": true },
          h("span", null, "LV"),
          h("strong", null, progress.level)),
        h("div", { className: "rs-game-profile-title" },
          
          h("strong", null, progress.title),
          chosenBadge ? h("span", null, "대표 · " + chosenBadge.title) : null),
        h("span", { className: "rs-game-profile-star", "aria-hidden": true }, chosenBadge?.icon || "✦"),
      ),
      h("div", { className: "rs-game-xp-head" },
        h("span", null, "XP"),
        h("strong", null, progress.levelXp + " / " + progress.nextLevelXp + " XP")),
      h("div", {
        className: "rs-game-xp-track",
        role: "progressbar",
        "aria-label": "다음 라이더 레벨까지 경험치",
        "aria-valuemin": 0,
        "aria-valuemax": progress.nextLevelXp,
        "aria-valuenow": progress.levelXp,
      }, h("span", { style: { width: progress.percent + "%" } })),
      h("div", { className: "rs-game-mini-stats" },
        h("div", null, h("b", null, progress.activeDays),
          h("small", null, "활동일")),
        h("div", null, h("b", null, progress.earnedBadges),
          h("small", null, "배지")),
        h("div", null, h("b", null, progress.xp),
          h("small", null, "누적 XP")),
      ),
      h("details", { className: "rs-game-collection" },
        h("summary", null,
          h("span", { className: "rs-game-collection-icon", "aria-hidden": true }, "✧"),
          h("strong", null, "업적"),
          h("small", null, progress.earnedBadges + " / " + progress.badges.length + " 수집"),
          h("span", { className: "rs-game-chevron", "aria-hidden": true }, "⌄")),
        h("div", { className: "rs-game-collection-grid" },
          ...progress.badges.map((badge) =>
            h("div", {
              key: badge.id,
              className: "rs-game-achievement" + (badge.unlocked ? " rs-game-earned" : ""),
              "aria-label": badge.title + (badge.unlocked ? " 획득" : " 미획득"),
            },
              h(Medal, { badge }),
              h("div", null,
                h("strong", null, badge.title),
                h("small", null, badge.unlocked ? badge.detail : badge.kind === "days" ? "기록한 날 " + progress.activeDays + " / " + badge.need + "일" : amount(progress.distanceKm) + " / " + badge.need + " km"),
                badge.unlocked ? h("button", { type: "button", className: "rs-game-badge-pick", "aria-pressed": chosenBadge?.id === badge.id,
                    onClick: () => selectBadge(chosenBadge?.id === badge.id ? "" : badge.id) },
                  chosenBadge?.id === badge.id ? "대표 배지 사용 중 ✓" : "대표 배지로 꾸미기") : null),
            )),
        ),
        h("p", { className: "rs-game-footnote" },
          "속도 경쟁 없이 완료한 운행 기록으로 계산돼요. 위치 공유와는 별개이며, 기록은 외부에 공개되지 않아요."),
      ),
    );
  }

  function DayRideCard({ history, day, income, celebrate = false }) {
    const result = riderDayResult(history, day);

    if (!result.completedTrips && !income) return null;
    const mins = Math.round(result.durationMs / 60000);
    const time = mins >= 60
      ? Math.floor(mins / 60) + "시간 " + (mins % 60 ? mins % 60 + "분" : "")
      : mins + "분";
    return h("section", {
      className: "rs-game-recap" + (celebrate ? " rs-game-fresh" : ""),
      "aria-label": "운행 결과와 획득한 경험치",
    },
      h("div", { className: "rs-game-recap-heading" },
        h("span", { className: "rs-game-recap-flare", "aria-hidden": true }, "✦"),
        h("div", null,
          h("small", { className: "rs-game-recap-date" }, recapDate(day)),
          h("h2", null, celebrate ? "운행 완료" : "운행 요약")),
        h("span", { className: "rs-game-xp-earned" }, "+" + result.earnedXp + " XP"),
      ),
      h("div", { className: "rs-game-recap-stats" },
        h("div", null, h("span", null, "운행"), h("strong", null, result.completedTrips, h("small", null, " 회"))),
        h("div", null, h("span", null, "거리"), h("strong", null, amount(result.distanceKm), h("small", null, " km"))),
        h("div", null, h("span", null, "시간"), h("strong", null, time)),
      ),
      income,
      result.newBadges.length
        ? h("div", { className: "rs-game-recap-badges" },
            h("span", null, "배지 획득"),
            ...result.newBadges.map((badge) =>
              h("span", { key: badge.id, className: "rs-game-recap-award" },
                h(Medal, { badge: { ...badge, unlocked: true }, small: true }),
                badge.title)),
          )
        : null,
    );
  }
  return { RiderProgressCard, DayRideCard };
}
