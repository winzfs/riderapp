import { createUI } from "./ui.mjs";
import { createRiderMap } from "./RiderMap.mjs";
import { createTimeline } from "./Timeline.mjs";
import { createGamificationUI } from "./gamification-ui.mjs";
import { createJourneyUI } from "./journey-ui.mjs";
import { createUseRide } from "./use-ride.mjs";
// Existing application behavior extracted verbatim from v59; data contracts unchanged.
export function mountApplication({
  S,
  q,
  Wo,
  qo,
  J,
  Be,
  Go,
  Ko,
  ve,
  fe,
  Se,
  Re,
  Pe,
  be,
  Ae,
  He,
  Jo,
  Xo,
  ge,
  We,
  Ge,
}) {
  const { Icon, Metrics, Skeleton, DialogSurface } = createUI(S);
  const { RiderProgressCard } = createGamificationUI(S);
  const { JourneyPanel } = createJourneyUI(S);
  function Qo(e, t) {
    let n = Math.PI / 180,
      r =
        Math.sin(((t.lat - e.lat) * n) / 2) ** 2 +
        Math.cos(e.lat * n) *
          Math.cos(t.lat * n) *
          Math.sin(((t.lng - e.lng) * n) / 2) ** 2;
    return 12742 * Math.atan2(Math.sqrt(r), Math.sqrt(1 - r));
  }
  function $o(e, t) {
    if (!Number.isFinite(t.lat) || !Number.isFinite(t.lng) || t.accuracy > 100)
      return e;
    let n = e.at(-1);
    return n &&
      (t.t - n.t < 5e3 || Qo(n, t) > Math.max(0.2, ((t.t - n.t) / 36e5) * 150))
      ? e
      : [...e, t].slice(-15e3);
  }
  function es(e) {
    return e.reduce(
      (t, n, r) =>
        t + (r && !n.break && n.t - e[r - 1].t < 12e4 ? Qo(e[r - 1], n) : 0),
      0,
    );
  }
  function ts(e) {
    return new Date(e).toLocaleTimeString(`ko-KR`, {
      hour: `2-digit`,
      minute: `2-digit`,
      hour12: !1,
    });
  }
  function ns(e) {
    return new Date(e).toLocaleDateString(`ko-KR`, {
      month: `long`,
      day: `numeric`,
      weekday: `short`,
    });
  }
  var rs = [
    "전체",
    "동네 이야기",
    "현장 정보",
    "질문·노하우",
    "정비",
    "중고 장터",
    "업계 소식",
  ];
  var rcAreas = [
    "광주 광산구",
    "광주 북구",
    "광주 서구",
    "광주 남구",
    "광주 동구",
    "전남 나주시",
  ];
  var rcDongs = [
    "운남동",
    "수완동",
    "신가동",
    "신창동",
    "첨단1동",
    "첨단2동",
    "하남동",
    "비아동",
    "우산동",
    "월곡1동",
    "월곡2동",
    "송정1동",
    "송정2동",
    "어룡동",
    "도산동",
    "평동",
    "임곡동",
    "동곡동",
    "삼도동",
    "본량동",
  ];
  function Community({ user: u, onLogin: login, notify: toast }) {
    const H = (tag, props, ...children) =>
      (0, S.createElement)(tag, props, ...children);
    const readArea = () => {
      try {
        return JSON.parse(localStorage.getItem("rs-community-area") || "{}");
      } catch {
        return {};
      }
    };
    const [area, setArea] = S.useState(() => {
      const saved = readArea();
      return {
        district: saved.district || "광주 광산구",
        dong: saved.dong || "",
        region: ["world", "district", "dong"].includes(saved.region)
          ? saved.region
          : saved.dong
            ? "dong"
            : "district",
      };
    });
    const { district, dong, region } = area;
    const [cat, setCat] = S.useState("전체");
    const [search, setSearch] = S.useState(""),
      [sort, setSort] = S.useState("latest");
    const [posts, setPosts] = S.useState([]),
      [likes, setLikes] = S.useState([]),
      [counts, setCounts] = S.useState([]);
    const [selected, setSelected] = S.useState(null),
      [comments, setComments] = S.useState([]);
    const draftKey = "rs:community-draft:" + (u?.id || "guest");
    const draft = (() => {
      try {
        const value = JSON.parse(localStorage.getItem(draftKey) || "{}");
        return value && typeof value === "object" ? value : {};
      } catch { return {}; }
    })();
    function saveDraft(event) {
      if (editing) return;
      const data = new FormData(event.currentTarget);
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          title: String(data.get("title") || "").slice(0, 100),
          body: String(data.get("body") || "").slice(0, 5000),
          category: String(data.get("category") || writeCategory),
          scope,
        }));
      } catch { /* Private browsing: keep the in-memory form intact. */ }
    }
    const [compose, setCompose] = S.useState(false),
      [scope, setScope] = S.useState("all");
    const [editing, setEditing] = S.useState(null),
      [context, setContext] = S.useState(null);
    const [link, setLink] = S.useState(null),
      [reporting, setReporting] = S.useState(false);
    const [request, setRequest] = S.useState(0);
    const [writeCategory, setWriteCategory] = S.useState("동네 이야기");
    const [editArea, setEditArea] = S.useState(false),
      [photo, setPhoto] = S.useState(null);
    const [loading, setLoading] = S.useState(true),
      [busy, setBusy] = S.useState(false);
    const [error, setError] = S.useState(""),
      [liking, setLiking] = S.useState("");
    const [newsTopic, setNewsTopic] = S.useState("전체"),
      [newsRev, setNewsRev] = S.useState(0);
    const [news, setNews] = S.useState([]),
      [newsBusy, setNewsBusy] = S.useState(false),
      [newsErr, setNewsErr] = S.useState("");
    const date = (v) => {
      const d = new Date(v);
      return !v || Number.isNaN(d.getTime())
        ? ""
        : d.toLocaleDateString("ko-KR", {
            timeZone: "Asia/Seoul",
            month: "short",
            day: "numeric",
          });
    };
    const categoryLabel = (category) =>
      category === "업계 소식" ? "업계 새소식" : category;
    const isNews = cat === "업계 소식";
    const regional = region !== "world";
    const query = search.trim().toLowerCase();
    const matches = (fields) =>
      !query ||
      fields.some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      );
    const areaLabel =
      region === "world"
        ? "전체 지역"
        : region === "dong"
          ? dong
          : district + " 전체";
    const img = (p) =>
      p.image_path
        ? q.storage.from("community-images").getPublicUrl(p.image_path).data
            .publicUrl
        : "";
    const place = (p) =>
      [p.area_district, p.area_dong].filter(Boolean).join(" · ");
    async function refresh() {
      try {
        const [p, l, c] = await Promise.all([
          Wo(
            q
              .from("posts")
              .select("*,road_reports(expires_at)")
              .order("created_at", { ascending: false })
              .limit(200),
          ),
          Wo(q.from("post_likes").select("post_id,user_id").limit(5000)),
          Wo(q.from("comments").select("post_id").limit(5000)),
        ]);
        setPosts(p || []);
        setLikes(l || []);
        setCounts(c || []);
        setError("");
      } catch (e) {
        setError("게시글을 불러오지 못했어요. 다시 시도해 주세요.");
      } finally {
        setLoading(false);
      }
    }
    async function refreshCounts() {
      try {
        const [l, c] = await Promise.all([
          Wo(q.from("post_likes").select("post_id,user_id").limit(5000)),
          Wo(q.from("comments").select("post_id").limit(5000)),
        ]);
        setLikes(l || []);
        setCounts(c || []);
      } catch (e) {
        console.warn("Statistics unavailable", e);
      }
    }
    S.useEffect(() => {
      rs33StoreArea(area);
    }, [area]);
    S.useEffect(() => {
      const receive = () => setRequest((value) => value + 1);
      window.addEventListener("riderspot:community-link", receive);
      return () =>
        window.removeEventListener("riderspot:community-link", receive);
    }, []);
    S.useEffect(() => {
      const incoming = window.__rs33CommunityRequest;
      if (!incoming) return;
      if (incoming.link) {
        if (!u) {
          login();
          return;
        }
        window.__rs33CommunityRequest = null;
        setEditing(null);
        setContext(incoming.link);
        setScope("local");
        setPhoto(null);
        setWriteCategory(incoming.link.kind === "roads" ? "현장 정보" : "정비");
        setSelected(null);
        setCompose(true);
        return;
      }
      window.__rs33CommunityRequest = null;
      let active = true;
      Wo(q.from("posts").select("*").eq("id", incoming.postId).maybeSingle())
        .then((post) => {
          if (!active) return;
          if (post) {
            setCompose(false);
            setSelected(post);
          } else toast("게시글을 찾을 수 없어요.");
        })
        .catch(() => {
          if (active) toast("게시글을 불러오지 못했어요.");
        });
      return () => {
        active = false;
      };
    }, [request, u?.id]);
    S.useEffect(() => {
      setReporting(false);
      setLink(null);
      if (!selected?.rider_place_id && !selected?.road_report_id) return;
      const kind = selected.road_report_id ? "roads" : "places";
      let active = true;
      q.from(kind === "roads" ? "road_reports" : "rider_places")
        .select(
          "id,title,category,lat,lng" + (kind === "roads" ? ",expires_at" : ""),
        )
        .eq("id", selected.road_report_id || selected.rider_place_id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (active) setLink({ kind, record: data, error: Boolean(error) });
        })
        .catch(() => {
          if (active) setLink({ kind, error: true });
        });
      return () => {
        active = false;
      };
    }, [selected?.id, selected?.rider_place_id, selected?.road_report_id]);
    S.useEffect(() => {
      refresh();
      const channel = q
        .channel("community-posts-v29")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "posts" },
          refresh,
        )
        .subscribe();
      const timer = setInterval(() => {
        if (!document.hidden) refresh();
      }, 60000);
      return () => {
        clearInterval(timer);
        q.removeChannel(channel);
      };
    }, []);
    S.useEffect(() => {
      if (!selected) return;
      const id = selected.id;
      let active = true;
      setComments([]);
      async function pull() {
        try {
          const rows = await Wo(
            q
              .from("comments")
              .select("*")
              .eq("post_id", id)
              .order("created_at")
              .limit(200),
          );
          if (active) setComments(rows || []);
        } catch (e) {
          toast("댓글을 읽지 못했어요.");
        }
      }
      pull();
      const channel = q
        .channel("community-comments-" + id)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "comments",
            filter: "post_id=eq." + id,
          },
          () => {
            pull();
            refreshCounts();
          },
        )
        .subscribe();
      return () => {
        active = false;
        q.removeChannel(channel);
      };
    }, [selected?.id]);
    S.useEffect(() => {
      if (cat !== "전체" && !isNews) return;
      let active = true;
      const abort = new AbortController();
      const deadline = setTimeout(() => abort.abort(), 10000);
      setNewsBusy(true);
      setNewsErr("");
      fetch(
        "/api/industry-news?topic=" +
          encodeURIComponent(isNews ? newsTopic : "전체"),
        { cache: "no-store", signal: abort.signal },
      )
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok)
            throw Error(data.message || "뉴스 연결에 실패했어요.");
          return data;
        })
        .then((data) => {
          if (active) setNews(Array.isArray(data.items) ? data.items : []);
        })
        .catch((error) => {
          if (active) {
            setNews([]);
            setNewsErr(
              error.name === "AbortError"
                ? "기사 제공처 응답이 늦어요. 다시 시도해 주세요."
                : error.message || "뉴스를 불러오지 못했어요.",
            );
          }
        })
        .finally(() => {
          clearTimeout(deadline);
          if (active) setNewsBusy(false);
        });
      return () => {
        active = false;
        clearTimeout(deadline);
        abort.abort();
      };
    }, [cat, isNews, newsTopic, newsRev]);
    const stats = S.useMemo(() => {
      const m = new Map();
      posts.forEach((p) => m.set(p.id, { likes: 0, comments: 0 }));
      likes.forEach((x) => {
        const a = m.get(x.post_id);
        if (a) a.likes++;
      });
      counts.forEach((x) => {
        const a = m.get(x.post_id);
        if (a) a.comments++;
      });
      return m;
    }, [posts, likes, counts]);
    const isLiked = (p) =>
      !!u && likes.some((l) => l.post_id === p.id && l.user_id === u.id);
    const count = (p, k) => stats.get(p.id)?.[k] || 0;
    async function toggleLike(p) {
      if (!u) return login();
      if (liking) return;
      setLiking(p.id);
      try {
        if (isLiked(p))
          await Wo(
            q
              .from("post_likes")
              .delete()
              .eq("post_id", p.id)
              .eq("user_id", u.id),
          );
        else
          await Wo(
            q.from("post_likes").insert({ post_id: p.id, user_id: u.id }),
          );
        await refreshCounts();
      } catch (e) {
        toast(e.message || "좋아요를 반영하지 못했어요.");
      } finally {
        setLiking("");
      }
    }
    const like = (p) =>
      H(
        "button",
        {
          type: "button",
          className: "rc-like" + (isLiked(p) ? " rc-liked" : ""),
          disabled: liking === p.id,
          onClick: () => toggleLike(p),
        },
        isLiked(p) ? "♥" : "♡",
        " ",
        count(p, "likes"),
      );
    const areaInputs = () =>
      H(
        "div",
        { className: "rc-area-fields" },
        H(
          "label",
          null,
          "시·군·구",
          H("input", {
            name: "area_district",
            required: true,
            list: "rc-area-list",
            maxLength: 60,
            placeholder: "광주 광산구",
            defaultValue: editing?.area_district || district,
          }),
        ),
        H(
          "label",
          null,
          "동네 (필수)",
          H("input", {
            name: "area_dong",
            required: true,
            list: "rc-dong-list",
            maxLength: 40,
            placeholder: "수완동",
            defaultValue: editing?.area_dong || dong,
          }),
        ),
      );
    const datalist = H(
      "div",
      { className: "rc-datalists" },
      H(
        "datalist",
        { id: "rc-area-list" },
        ...rcAreas.map((v) => H("option", { key: v, value: v })),
      ),
      H(
        "datalist",
        { id: "rc-dong-list" },
        ...rcDongs.map((v) => H("option", { key: v, value: v })),
      ),
    );
    function setRegion(next) {
      setArea((current) => ({ ...current, region: next }));
      setEditArea(false);
    }
    function saveArea(ev) {
      ev.preventDefault();
      const values = new FormData(ev.currentTarget);
      const place = String(values.get("district") || "").trim(),
        sub = String(values.get("dong") || "").trim();
      if (place.length < 2) return toast("시·군·구를 입력해 주세요.");
      setArea({
        district: place,
        dong: sub,
        region: sub ? "dong" : "district",
      });
      setEditArea(false);
    }
    function write(preferredCategory) {
      if (!u) return login();
      setEditing(null);
      setContext(null);
      const directCategory = typeof preferredCategory === "string" && rs.includes(preferredCategory) ? preferredCategory : null;
      setWriteCategory(directCategory || (rs.includes(draft.category) ? draft.category : cat === "전체" ? "동네 이야기" : cat));
      setScope(directCategory ? (regional ? "local" : "all") : (["all", "local"].includes(draft.scope) ? draft.scope : regional && !isNews ? "local" : "all"));
      setPhoto(null);
      setCompose(true);
      setSelected(null);
    }
    async function shrink(file) {
      const picture = await createImageBitmap(file);
      try {
        for (const side of [1600, 1200, 900]) {
          const ratio = Math.min(
              1,
              side / Math.max(picture.width, picture.height),
            ),
            canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(picture.width * ratio));
          canvas.height = Math.max(1, Math.round(picture.height * ratio));
          canvas
            .getContext("2d")
            .drawImage(picture, 0, 0, canvas.width, canvas.height);
          for (const quality of [0.83, 0.7, 0.55]) {
            const blob = await new Promise((resolve, reject) =>
              canvas.toBlob(
                (b) => (b ? resolve(b) : reject(Error("사진 변환 오류"))),
                "image/jpeg",
                quality,
              ),
            );
            if (blob.size < 2900000) return blob;
          }
        }
        throw Error("사진이 너무 커요. 다른 사진을 선택해 주세요.");
      } finally {
        picture.close?.();
      }
    }
    async function submitPost(ev) {
      ev.preventDefault();
      if (!u) return login();
      if (busy) return;
      const data = new FormData(ev.currentTarget),
        title = String(data.get("title") || "").trim(),
        body = String(data.get("body") || "").trim();
      const category = String(data.get("category"));
      const isLocal = scope === "local" && category !== "업계 소식";
      const area = isLocal
        ? String(data.get("area_district") || "").trim()
        : null;
      const neighborhood = isLocal
        ? String(data.get("area_dong") || "").trim()
        : null;
      if (!title || !body) return toast("제목과 내용을 입력해 주세요.");
      if (isLocal && (area.length < 2 || !neighborhood))
        return toast("동네 글에는 지역과 동네 이름을 입력해 주세요.");
      setBusy(true);
      let path = null;
      try {
        if (photo) {
          const blob = await shrink(photo);
          path =
            u.id +
            "/" +
            Date.now().toString(36) +
            "-" +
            crypto.randomUUID().replace(/-/g, "").slice(0, 16) +
            ".jpg";
          const uploaded = await q.storage
            .from("community-images")
            .upload(path, blob, { contentType: "image/jpeg", upsert: false });
          if (uploaded.error) throw uploaded.error;
        }
        const fields = {
          title,
          body,
          category,
          area_district: area,
          area_dong: neighborhood,
        };
        if (path) fields.image_path = path;
        if (context)
          fields[
            context.kind === "roads" ? "road_report_id" : "rider_place_id"
          ] = context.id;
        if (editing) {
          await Wo(
            q
              .from("posts")
              .update(fields)
              .eq("id", editing.id)
              .eq("user_id", u.id),
          );
          if (path && editing.image_path)
            try {
              await q.storage
                .from("community-images")
                .remove([editing.image_path]);
            } catch {}
          setEditing(null);
          setContext(null);
          setCompose(false);
          setSelected({ ...editing, ...fields });
          setPhoto(null);
          await refresh();
          toast("글을 수정했어요.");
          return;
        }
        await Wo(
          q.from("posts").insert({ user_id: u.id, nickname: qo(u), ...fields }),
        );
        if (isLocal)
          setArea((current) => ({
            district: area,
            dong: neighborhood,
            region: current.region === "district" ? "district" : "dong",
          }));
        else if (category !== "업계 소식" && region === "dong")
          setArea((current) => ({ ...current, region: "district" }));
        setCompose(false);
        setContext(null);
        setPhoto(null);
        setCat(category);
        setSearch("");
        if (!editing) {
          try { localStorage.removeItem(draftKey); } catch {}
        }
        await refresh();
        toast(editing ? "글을 수정했어요." : "글을 등록했어요.");
      } catch (e) {
        if (path)
          try {
            await q.storage.from("community-images").remove([path]);
          } catch (ex) {}
        toast(e.message || "글을 등록하지 못했어요.");
      } finally {
        setBusy(false);
      }
    }
    async function submitComment(ev) {
      ev.preventDefault();
      if (!u) return login();
      if (busy) return;
      const form = ev.currentTarget,
        body = String(new FormData(form).get("comment") || "").trim();
      if (!body) return;
      setBusy(true);
      try {
        await Wo(
          q.from("comments").insert({
            post_id: selected.id,
            user_id: u.id,
            nickname: qo(u),
            body,
          }),
        );
        form.reset();
        setComments(
          await Wo(
            q
              .from("comments")
              .select("*")
              .eq("post_id", selected.id)
              .order("created_at")
              .limit(200),
          ),
        );
        await refreshCounts();
      } catch (e) {
        toast(e.message || "댓글 등록에 실패했어요.");
      } finally {
        setBusy(false);
      }
    }
    async function removePost() {
      if (
        !u ||
        u.id !== selected?.user_id ||
        !confirm("게시글과 댓글을 삭제할까요?")
      )
        return;
      setBusy(true);
      try {
        await Wo(q.from("posts").delete().eq("id", selected.id));
        if (selected.image_path)
          try {
            await q.storage
              .from("community-images")
              .remove([selected.image_path]);
          } catch (e) {}
        setSelected(null);
        await refresh();
        toast("게시글을 삭제했어요.");
      } catch (e) {
        toast(e.message || "삭제에 실패했어요.");
      } finally {
        setBusy(false);
      }
    }
    const back = () =>
      H(
        "button",
        {
          className: "back rc-back",
          type: "button",
          onClick: () => {
            if (editing) setSelected(editing);
            else setSelected(null);
            setCompose(false);
            setEditing(null);
            setContext(null);
          },
        },
        "‹  커뮤니티",
      );
    async function reportPost(event) {
      event.preventDefault();
      if (!u) return login();
      if (busy || !selected) return;
      const reason = new FormData(event.currentTarget).get("reason");
      setBusy(true);
      try {
        const result = await q
          .from("rider_post_reports")
          .insert({ post_id: selected.id, user_id: u.id, reason });
        if (result.error && result.error.code !== "23505") throw result.error;
        setReporting(false);
        toast(result.error ? "이미 신고한 글이에요." : "신고를 접수했어요.");
      } catch (error) {
        toast(error.message || "신고를 접수하지 못했어요.");
      } finally {
        setBusy(false);
      }
    }
    function editPost() {
      setEditing(selected);
      setContext(null);
      setPhoto(null);
      setWriteCategory(selected.category);
      setScope(selected.area_district ? "local" : "all");
      setCompose(true);
    }
    if (compose)
      return H(
        "section",
        { className: "page narrow rc-community rc-editor" },
        datalist,
        back(),
        H("h1", null, editing ? "글 수정" : "글쓰기"),
        !editing && (draft.title || draft.body)
          ? H("p", { className: "rs61-draft-note", role: "status" }, "이전에 작성하던 내용이 보관되어 있어요.")
          : null,
        H(
          "form",
          { className: "form rc-form", onSubmit: submitPost, onInput: saveDraft },
          context
            ? H(
                "div",
                { className: "rs33-link-context" },
                "지도에 연결된 글 · ",
                context.title,
              )
            : null,
          H(
            "label",
            null,
            "카테고리",
            H(
              "select",
              {
                name: "category",
                value: writeCategory,
                onChange: (e) => setWriteCategory(e.target.value),
              },
              ...rs
                .slice(1)
                .map((c) =>
                  H("option", { key: c, value: c }, categoryLabel(c)),
                ),
            ),
          ),
          writeCategory === "업계 소식"
            ? H(
                "p",
                { className: "rc-info" },
                "업계 새소식은 전체 지역에 표시돼요.",
              )
            : H(
                "div",
                { className: "rc-editor-area" },
                H(
                  "div",
                  {
                    className: "rc-scope",
                    role: "group",
                    "aria-label": "게시 범위",
                  },
                  H(
                    "button",
                    {
                      type: "button",
                      className: scope === "all" ? "selected" : "",
                      "aria-pressed": scope === "all",
                      onClick: () => setScope("all"),
                    },
                    "전체 지역",
                  ),
                  H(
                    "button",
                    {
                      type: "button",
                      className: scope === "local" ? "selected" : "",
                      "aria-pressed": scope === "local",
                      onClick: () => setScope("local"),
                    },
                    "동네 글",
                  ),
                ),
                scope === "local" ? areaInputs() : null,
              ),
          H(
            "label",
            null,
            "제목",
            H("input", {
              name: "title",
              required: true,
              maxLength: 100,
              defaultValue: editing?.title || context?.title || draft.title || "",
              placeholder: "어떤 이야기를 나누고 싶나요?",
            }),
          ),
          H(
            "label",
            null,
            "내용",
            H("textarea", {
              name: "body",
              required: true,
              maxLength: 5000,
              rows: 7,
              defaultValue: editing?.body || draft.body || "",
              placeholder: "동료 라이더에게 들려주세요.",
            }),
          ),
          H(
            "label",
            { className: "rc-photo-field" },
            "📷 사진 첨부 (선택, 1장)",
            H("input", {
              type: "file",
              accept: "image/jpeg,image/png,image/webp",
              onChange: (ev) => {
                const f = ev.target.files?.[0] || null;
                if (f && f.size > 10000000) {
                  ev.target.value = "";
                  setPhoto(null);
                  toast("10MB 이하 사진을 선택해 주세요.");
                } else setPhoto(f);
              },
            }),
          ),
          photo
            ? H(
                "p",
                { className: "rc-photo-name" },
                "선택한 사진: ",
                photo.name,
                " ",
                H(
                  "button",
                  { type: "button", onClick: () => setPhoto(null) },
                  "× 취소",
                ),
              )
            : null,
          H(
            "p",
            { className: "rc-safety" },
            "고객 이름·주소·현관 비밀번호·차량번호가 보이는 사진은 올리지 마세요. 사진의 위치 메타데이터는 업로드 전에 제거됩니다. 글 초안은 이 기기에만 보관돼요.",
          ),
          H(
            "button",
            { className: "primary rc-submit", disabled: busy, type: "submit" },
            busy ? "저장 중…" : editing ? "수정 저장" : "글 등록하기",
          ),
        ),
      );
    if (selected)
      return H(
        "section",
        { className: "page narrow rc-community rc-detail rs63-post-detail" },
        back(),
        H(
          "div",
          { className: "rc-detail-head" },
          H(
            "div",
            { className: "rc-tags" },
            H(
              "span",
              { className: "rc-tag" },
              categoryLabel(selected.category),
            ),
            place(selected)
              ? H("span", { className: "rc-local-tag" }, "📍 ", place(selected))
              : null,
          ),
          H("h1", null, selected.title),
          H(
            "p",
            { className: "rc-author" },
            selected.nickname,
            " · ",
            date(selected.created_at),
            " ",
            ts(selected.created_at),
          ),
        ),
        H("p", { className: "rc-detail-body" }, selected.body),
        link
          ? H(
              "div",
              { className: "rs33-link-context" },
              link.record &&
                (!link.record.expires_at ||
                  Date.parse(link.record.expires_at) > Date.now())
                ? H(
                    "button",
                    {
                      type: "button",
                      onClick: () => rs33OpenMap(link.record, link.kind),
                    },
                    "지도에서 보기 · ",
                    link.record.title,
                  )
                : link.error
                  ? "연결된 장소를 불러오지 못했어요."
                  : link.kind === "roads"
                    ? "제보가 종료되어 지도에서 숨겨졌어요."
                    : "연결된 장소를 찾을 수 없어요.",
            )
          : null,
        selected.image_path
          ? H("img", {
              src: img(selected),
              alt: "첨부 사진",
              className: "rc-detail-photo",
              loading: "lazy",
            })
          : null,
        H(
          "div",
          { className: "rc-detail-actions rs33-detail-actions" },
          H(
            "div",
            { className: "rs63-post-primary-actions" },
            like(selected),
            H(
              "button",
              {
                type: "button",
                className: "rs63-comment-jump",
                onClick: () =>
                  document.getElementById("rs-community-comments")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  }),
              },
              "댓글 ",
              count(selected, "comments"),
            ),
            H(BookmarkButton, {
              user: u,
              kind: "post",
              id: selected.id,
              onLogin: login,
              notify: toast,
            }),
          ),
          H(
            "details",
            { className: "rs63-post-manage-menu" },
            H("summary", { "aria-label": "게시글 더보기" }, "⋯"),
            H(
              "div",
              { className: "rs63-post-menu-options" },
              u?.id === selected.user_id
                ? H("button", { type: "button", onClick: editPost, disabled: busy }, "수정")
                : null,
              u?.id === selected.user_id
                ? H("button", { type: "button", onClick: removePost, disabled: busy, className: "rc-delete" }, "삭제")
                : H("button", {
                    type: "button",
                    onClick: () => u ? setReporting((value) => !value) : login(),
                    "aria-expanded": reporting,
                  }, "신고"),
            ),
          ),
        ),
        reporting
          ? H(
              "form",
              { className: "rs33-report-post-form", onSubmit: reportPost },
              H(
                "select",
                { name: "reason", "aria-label": "신고 사유" },
                ...["개인정보", "광고·스팸", "욕설·괴롭힘", "기타"].map(
                  (reason) =>
                    H("option", { key: reason, value: reason }, reason),
                ),
              ),
              H(
                "button",
                { type: "submit", className: "secondary", disabled: busy },
                "신고 접수",
              ),
            )
          : null,
        H("h2", { className: "rc-comments-title", id: "rs-community-comments" }, "댓글 ", comments.length),
        H(
          "div",
          { className: "rc-comments" },
          comments.length
            ? comments.map((c) =>
                H(
                  "div",
                  { className: "rc-comment", key: c.id },
                  H(
                    "div",
                    { className: "rc-comment-meta" },
                    H("strong", null, c.nickname),
                    H("span", null, date(c.created_at)),
                  ),
                  H("p", null, c.body),
                ),
              )
            : H(
                "p",
                { className: "rc-no-comments" },
                "아직 댓글이 없어요. 첫 댓글을 남겨보세요.",
              ),
        ),
        H(
          "form",
          { className: "rc-comment-form", onSubmit: submitComment },
          H("textarea", {
            name: "comment",
            required: true,
            rows: 2,
            maxLength: 1000,
            placeholder: "댓글을 남겨주세요.",
            "aria-label": "댓글",
          }),
          H(
            "button",
            { className: "primary", disabled: busy, type: "submit" },
            busy ? "…" : "등록",
          ),
        ),
      );
    const shown = posts.filter((post) => {
      const industry = post.category === "업계 소식";
      const inRegion =
        !regional ||
        industry ||
        (region === "dong"
          ? post.area_district === district && post.area_dong === dong
          : !post.area_district || post.area_district === district);
      return (
        inRegion &&
        (cat === "전체" || post.category === cat) &&
        matches([
          post.title,
          post.body,
          post.nickname,
          post.area_dong,
          post.area_district,
        ])
      );
    });
    const card = (post) =>
      H(
        "article",
        { className: "rc-card rc-feed-row", key: "post:" + post.id },
        H(
          "button",
          {
            className: "rc-card-main",
            type: "button",
            onClick: () => setSelected(post),
          },
          H("span", { className: "rc-tag" }, categoryLabel(post.category)),
          H(
            "div",
            { className: "rc-card-grid" },
            H("div", null, H("h2", null, post.title), H("p", null, post.body)),
            post.image_path
              ? H("img", {
                  src: img(post),
                  alt: "게시글 첨부 사진",
                  loading: "lazy",
                })
              : null,
          ),
        ),
        H(
          "div",
          { className: "rc-card-bottom" },
          H(
            "small",
            { className: "rc-row-meta" },
            [
              post.area_dong ||
                post.area_district ||
                (post.category === "업계 소식" ? "전체 지역" : "지역 미등록"),
              post.nickname || "라이더",
              date(post.created_at),
              "댓글 " + count(post, "comments"),
              post.road_report_id && !post.road_reports ? "제보 종료" : null,
            ]
              .filter(Boolean)
              .join(" · "),
          ),
          H("div", { className: "rc-row-like" }, like(post)),
        ),
      );
    const articles =
      isNews || cat === "전체"
        ? news
            .filter(
              (article) =>
                article &&
                typeof article.title === "string" &&
                typeof article.link === "string" &&
                /^https:\/\/news\.google\.com\//.test(article.link) &&
                matches([article.title, article.source]),
            )
            .slice(0, isNews ? 30 : 3)
        : [];
    const official =
      isNews && newsErr
        ? [
            {
              title: "쿠팡이츠 배달파트너 앱 활용 가이드",
              source: "쿠팡이츠 배달파트너",
              link: "https://ces.coupangeats.com/app-guide/",
            },
            {
              title: "배민커넥트 시작 안내",
              source: "배민커넥트",
              link: "https://join.baeminconnect.com/",
            },
          ].filter((item) => matches([item.title, item.source]))
        : [];
    const rows = [
      ...shown.map((post) => ({
        time: Date.parse(post.created_at) || 0,
        score:
          sort === "comments"
            ? count(post, "comments")
            : sort === "popular"
              ? 2 * count(post, "likes") + count(post, "comments")
              : 0,
        node: card(post),
      })),
      ...articles.map((article) => ({
        time: Date.parse(article.published_at) || 0,
        score: 0,
        node: H(
          "article",
          {
            className: "rc-card rc-feed-row rc-article-row",
            key: "news:" + article.link,
          },
          H(
            "a",
            {
              className: "rc-card-main",
              href: article.link,
              target: "_blank",
              rel: "noopener noreferrer",
            },
            H(
              "span",
              { className: "rc-tag rc-article-tag" },
              "외부 기사",
            ),
            H(
              "div",
              { className: "rc-card-grid" },
              H("div", null, H("h2", null, article.title)),
            ),
            H(
              "small",
              { className: "rc-row-meta" },
              [
                article.source || "언론사",
                date(article.published_at),
                "원문 보기 ↗",
              ]
                .filter(Boolean)
                .join(" · "),
            ),
          ),
        ),
      })),
    ].sort((a, b) => b.score - a.score || b.time - a.time);
    const empty = H(
      "div",
      { className: "rc-empty" },
      H(
        "h2",
        null,
        query
          ? "검색 결과가 없어요"
          : isNews
            ? "표시할 새소식이 없어요"
            : regional
              ? "이 지역에 글이 없어요"
              : "아직 게시글이 없어요",
      ),
      query
        ? H(
            "button",
            {
              className: "secondary small",
              type: "button",
              onClick: () => setSearch(""),
            },
            "검색어 지우기",
          )
        : regional && !isNews
          ? H(
              "button",
              {
                className: "secondary small",
                type: "button",
                onClick: () =>
                  setRegion(region === "dong" ? "district" : "world"),
              },
              region === "dong" ? "구 전체 보기" : "전체 지역 보기",
            )
          : !isNews
            ? H(
                "button",
                {
                  className: "secondary small",
                  type: "button",
                  onClick: write,
                },
                "첫 글 남기기",
              )
            : null,
    );
    return H(
      "section",
      { className: "page rc-community rc-home rc-community-v32" },
      datalist,
      H(
        "div",
        { className: "rc-head" },
        H("h1", null, "커뮤니티"),
        H(
          "button",
          { className: "primary rc-write", type: "button", onClick: write },
          "＋ 글쓰기",
        ),
      ),
      H("section", { className: "rs-lounge-quick", "aria-label": "동네 라이더 라운지" },
        H("div", { className: "rs-lounge-title" },
          H("div", null, H("strong", null, "동네 라이더 라운지"), H("small", null, areaLabel + " · 기존 게시판에서 이어져요"))),
        H("div", { className: "rs-lounge-actions" },
          H("button", { type: "button", onClick: () => write("질문·노하우") }, "동네에 질문하기 ↗"),
          H("button", { type: "button", onClick: () => write("현장 정보") }, "현장 정보 나누기 ↗"))),
      H(
        "div",
        { className: "rc-controls" },
        H(
          "label",
          { className: "rc-search" },
          H("span", { "aria-hidden": true }, "⌕"),
          H("input", {
            type: "search",
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: isNews ? "게시글·기사 검색" : "게시글 검색",
            "aria-label": "게시글 검색",
          }),
        ),
        H(
          "div",
          { className: "rc-filter-row" },
          H(
            "button",
            {
              type: "button",
              className: "rc-area-button",
              "aria-expanded": editArea,
              "aria-controls": "rc-region-controls",
              onClick: () => setEditArea((value) => !value),
            },
            areaLabel,
            " ▾",
          ),
          H(
            "select",
            {
              value: sort,
              onChange: (e) => setSort(e.target.value),
              "aria-label": "정렬 기준",
            },
            H("option", { value: "latest" }, "최신순"),
            H("option", { value: "popular" }, "인기순"),
            H("option", { value: "comments" }, "댓글순"),
          ),
        ),
        H(
          "div",
          { id: "rc-region-controls", hidden: !editArea },
          editArea
            ? H(
                "div",
                { className: "rc-area-panel" },
                H(
                  "form",
                  { onSubmit: saveArea },
                  H(
                    "div",
                    { className: "rc-area-fields" },
                    H(
                      "label",
                      null,
                      "시·군·구",
                      H("input", {
                        name: "district",
                        list: "rc-area-list",
                        defaultValue: district,
                        maxLength: 60,
                        required: true,
                        placeholder: "광주 광산구",
                      }),
                    ),
                    H(
                      "label",
                      null,
                      "동 (선택)",
                      H("input", {
                        name: "dong",
                        list: "rc-dong-list",
                        defaultValue: dong,
                        maxLength: 40,
                        placeholder: "수완동",
                      }),
                    ),
                  ),
                  H(
                    "div",
                    { className: "rc-area-actions" },
                    H(
                      "button",
                      {
                        type: "button",
                        className: "secondary",
                        onClick: () => setRegion("world"),
                      },
                      "전체 지역",
                    ),
                    H(
                      "button",
                      { type: "submit", className: "primary" },
                      "이 지역 글 보기",
                    ),
                  ),
                ),
              )
            : null,
        ),
        H(
          "div",
          { className: "rc-category-wrap" },
          H(
            "div",
            {
              className: "rc-categories",
              role: "group",
              "aria-label": "게시글 카테고리",
            },
            ...rs.map((category) =>
              H(
                "button",
                {
                  type: "button",
                  key: category,
                  className: category === cat ? "selected" : "",
                  "aria-pressed": category === cat,
                  onClick: () => setCat(category),
                },
                categoryLabel(category),
              ),
            ),
          ),
          H(
            "button",
            {
              type: "button",
              className: "rc-category-next",
              "aria-label": "다음 카테고리 보기",
              onClick: (event) =>
                event.currentTarget.previousElementSibling?.scrollBy({
                  left: Math.max(160, Math.round(event.currentTarget.previousElementSibling.clientWidth * 0.72)),
                  behavior: "smooth",
                }),
            },
            "›",
          ),
        ),
      ),
      isNews
        ? H(
            "div",
            { className: "rc-news-tools" },
            H(
              "label",
              null,
              "기사 분야 ",
              H(
                "select",
                {
                  value: newsTopic,
                  onChange: (e) => setNewsTopic(e.target.value),
                  "aria-label": "기사 분야",
                },
                ...["전체", "플랫폼", "정책·제도", "안전"].map((topic) =>
                  H("option", { key: topic, value: topic }, topic),
                ),
              ),
            ),
            !newsErr ? H(
              "button",
              {
                type: "button",
                onClick: () => setNewsRev((value) => value + 1),
              },
              "기사 새로고침",
            ) : null,
          )
        : null,
      error
        ? H(
            "div",
            { className: "rc-feed-status", role: "status" },
            H("p", null, error),
            H(
              "button",
              { onClick: refresh, type: "button" },
              "글 다시 불러오기",
            ),
          )
        : null,
      isNews && newsErr
        ? H(
            "div",
            { className: "rc-feed-status", role: "status" },
            H("p", null, newsErr),
            H(
              "button",
              {
                type: "button",
                onClick: () => setNewsRev((value) => value + 1),
              },
              "기사 다시 불러오기",
            ),
          )
        : null,
      rows.length
        ? H(
            "div",
            { className: "rc-card-list" },
            ...rows.map((row) => row.node),
          )
        : loading || (isNews && newsBusy)
          ? H(Skeleton, { label: "게시글을 불러오는 중" })
          : !error && (!isNews || !newsErr)
            ? empty
            : null,
      isNews && official.length
        ? H(
            "section",
            { className: "rc-official-resources", "aria-label": "공식 참고자료" },
            H("h2", null, "공식 참고자료"),
            H("p", null, "실시간 기사가 아니라 서비스 이용 안내 문서입니다."),
            ...official.map((article) =>
              H(
                "a",
                { key: article.link, href: article.link, target: "_blank", rel: "noopener noreferrer" },
                H("strong", null, article.title),
                H("small", null, article.source + " · 원문 보기 ↗"),
              ),
            ),
          )
        : null,
    );
  }
  function AuthDialog({ close: e, notify: t }) {
    let [n, r] = (0, S.useState)(!1),
      [i, a] = (0, S.useState)(!1),
      [o, s] = (0, S.useState)(``);
    async function h() {
      if (i) return;
      (a(!0), s(``));
      try {
        let { error: e } = await q.auth.signInWithOAuth({
          provider: `google`,
          options: { redirectTo: location.origin + `/` },
        });
        if (e) throw e;
      } catch (e) {
        (s(e?.message || `Google 로그인을 시작하지 못했어요.`), a(!1));
      }
    }
    async function c(r) {
      (r.preventDefault(), a(!0), s(``));
      let i = new FormData(r.currentTarget);
      try {
        let r = { email: i.get(`email`), password: i.get(`password`) },
          { data: a, error: o } = n
            ? await q.auth.signUp({
                ...r,
                options: {
                  data: { nickname: i.get(`nickname`) },
                  emailRedirectTo: location.origin,
                },
              })
            : await q.auth.signInWithPassword(r);
        if (o) throw o;
        a.session
          ? (e(), t(`반가워요. 안전하게 달려요!`))
          : s(
              `가입 확인 메일을 보냈어요. 메일의 인증 링크를 누른 뒤 로그인해 주세요.`,
            );
      } catch (e) {
        s(e.message);
      } finally {
        a(!1);
      }
    }
    return (0, J.jsx)(DialogSurface, {
      onClose: e,
      children: (0, J.jsxs)(`section`, {
        className: `modal`,
        role: `dialog`,
        "aria-modal": `true`,
        "aria-labelledby": `auth-title`,
        children: [
          (0, J.jsx)(`button`, {
            className: `close`,
            "aria-label": `닫기`,
            onClick: e,
            children: `×`,
          }),
          (0, J.jsx)(`div`, {
            className: `avatar`,
            children: (0, J.jsx)(Be, {}),
          }),
          (0, J.jsx)(`h2`, {
            id: `auth-title`,
            children: n
              ? `함께 달릴 준비됐나요?`
              : `라이더스팟에 오신 걸 환영해요`,
          }),
          (0, J.jsx)(`p`, {
            className: `muted`,
            children: `계정으로 내 운행 기록을 안전하게 보관하세요.`,
          }),
          (0, J.jsxs)(`form`, {
            className: `form`,
            onSubmit: c,
            children: [
              n &&
                (0, J.jsxs)(`label`, {
                  children: [
                    `닉네임`,
                    (0, J.jsx)(`input`, {
                      name: `nickname`,
                      required: !0,
                      maxLength: 24,
                      autoComplete: `nickname`,
                      placeholder: `동료에게 보여줄 이름`,
                    }),
                  ],
                }),
              (0, J.jsxs)(`label`, {
                children: [
                  `이메일`,
                  (0, J.jsx)(`input`, {
                    type: `email`,
                    name: `email`,
                    required: !0,
                    autoComplete: `email`,
                    placeholder: `rider@example.com`,
                  }),
                ],
              }),
              (0, J.jsxs)(`label`, {
                children: [
                  `비밀번호`,
                  (0, J.jsx)(`input`, {
                    type: `password`,
                    name: `password`,
                    required: !0,
                    minLength: 8,
                    autoComplete: n ? `new-password` : `current-password`,
                    placeholder: `8자 이상`,
                  }),
                ],
              }),
              o &&
                (0, J.jsx)(`p`, {
                  role: `status`,
                  className: `notice`,
                  children: o,
                }),
              (0, J.jsx)(`button`, {
                className: `primary`,
                disabled: i,
                children: i ? `처리 중…` : n ? `이메일로 가입하기` : `로그인`,
              }),
            ],
          }),
          (0, J.jsx)(`div`, {
            className: `oauth-divider`,
            role: `separator`,
            children: `또는`,
          }),
          (0, J.jsxs)(`button`, {
            type: `button`,
            className: `google-login-button`,
            disabled: i,
            onClick: h,
            "aria-label": `Google 계정으로 로그인`,
            children: [
              (0, J.jsx)(`span`, {
                className: `google-mark`,
                "aria-hidden": `true`,
                children: `G`,
              }),
              `Google 계정으로 계속하기`,
            ],
          }),
          (0, J.jsx)(`button`, {
            className: `text-button`,
            onClick: () => {
              (r(!n), s(``));
            },
            children: n
              ? `이미 계정이 있어요 · 로그인`
              : `처음이신가요? 회원가입`,
          }),
        ],
      }),
    });
  }
  function Profile({
    user: e,
    onLogin: t,
    onLogout: n,
    notify: r,
    sharing,
    toggle,
    history = [],
    riding = false,
    onTimeline,
  }) {
    let i = `notes:` + (e?.id || `guest`),
      [a, o] = (0, S.useState)(() => Go(i, [])),
      [s, c] = (0, S.useState)(``),
      [rs62EditorOpen, rs62SetEditorOpen] = S.useState(false);
    S.useEffect(() => {
      const sync = () => document.getElementById("rs-nickname-settings")?.classList.toggle("rs62-open", rs62EditorOpen);
      sync();
      const delayed = window.setTimeout(sync, 1100);
      return () => window.clearTimeout(delayed);
    }, [rs62EditorOpen]);
    function l(e) {
      (o(e), Ko(i, e));
    }
    return (0, J.jsxs)(`section`, {
      className: `page narrow rs-profile-page`,
      children: [
        (0, J.jsx)(`h1`, { children: `내 정보` }),
        (0, J.jsxs)(`div`, {
          className: `profile`,
          children: [
            (0, J.jsx)(`div`, {
              className: `avatar`,
              children: (0, J.jsx)(Be, {}),
            }),
            (0, J.jsxs)(`div`, {
              children: [
                (0, J.jsx)(`h2`, {
                  children: e ? qo(e) : `반가워요, 라이더님`,
                }),
                (0, J.jsx)(`p`, {
                  className: `muted`,
                  children: e
                    ? `오늘도 안전 운행하세요.`
                    : `로그인하고 동료들과 연결해 보세요.`,
                }),
              ],
            }),
            e
              ? (0, J.jsx)(`button`, {
                  type: `button`,
                  className: `rs62-profile-edit`,
                  "aria-controls": `rs-nickname-settings`,
                  "aria-expanded": rs62EditorOpen,
                  onClick: () => rs62SetEditorOpen((open) => !open),
                  children: rs62EditorOpen ? `편집 닫기` : `프로필 수정`,
                })
              : null,
            e
              ? (0, J.jsx)(`button`, {
                  "aria-label": `로그아웃`,
                  onClick: n,
                  children: (0, J.jsx)(ve, { size: 20 }),
                })
              : (0, J.jsx)(`button`, {
                  className: `primary small`,
                  onClick: t,
                  children: `로그인`,
                }),
          ],
        }),
        S.createElement(Metrics, {
          label: "내 저장된 활동",
          items: [
            ["총 운행", history.length, "회"],
            [
              "누적 거리",
              new Intl.NumberFormat("ko-KR", {
                maximumFractionDigits: 1,
              }).format(
                history.reduce(
                  (sum, t) => sum + Math.max(0, Number(t.distance_km) || 0),
                  0,
                ),
              ),
              "km",
            ],
          ],
        }),
        (0, J.jsx)(RiderProgressCard, { history, userId: e?.id }),
        (0, J.jsx)(JourneyPanel, { history, userId: e?.id, riding, onTimeline }, e?.id || "guest"),
        (0, J.jsx)(ProfileTools, {
          user: e,
          onLogin: t,
          sharing,
          toggle,
          notify: r,
        }),
        (0, J.jsx)(`button`, {
          type: `button`,
          className: `secondary rs61-shortcuts-link`,
          onClick: () => window.__rsOpenTool?.("shortcuts"),
          children: `배달 문구와 현장 도구는 업무에서 사용하기 ›`,
        }),
        (0, J.jsxs)(`h2`, {
          className: `tool-title`,
          children: [(0, J.jsx)(Se, { size: 21 }), ` 개인 메모`],
        }),
        (0, J.jsx)(`p`, {
          className: `muted`,
          children: `이 브라우저에만 저장돼요. 고객 개인정보는 적지 마세요.`,
        }),
        (0, J.jsxs)(`form`, {
          className: `inline`,
          onSubmit: (e) => {
            (e.preventDefault(),
              s.trim() &&
                (l([{ id: crypto.randomUUID(), text: s.trim() }, ...a]),
                c(``)));
          },
          children: [
            (0, J.jsx)(`input`, {
              "aria-label": `개인 메모`,
              maxLength: 300,
              value: s,
              onChange: (e) => c(e.target.value),
              placeholder: `픽업 위치, 출입구 등 기억할 내용`,
              required: !0,
            }),
            (0, J.jsx)(`button`, { className: `primary`, children: `저장` }),
          ],
        }),
        (0, J.jsx)(`div`, {
          className: `notes`,
          children: a.map((e) =>
            (0, J.jsxs)(
              `div`,
              {
                children: [
                  (0, J.jsx)(`span`, { children: e.text }),
                  (0, J.jsx)(`button`, {
                    "aria-label": `메모 삭제`,
                    onClick: () => l(a.filter((t) => t.id !== e.id)),
                    children: (0, J.jsx)(Re, { size: 17 }),
                  }),
                ],
              },
              e.id,
            ),
          ),
        }),
        (0, J.jsxs)(`div`, {
          className: `privacy`,
          children: [
            (0, J.jsx)(Pe, { size: 22 }),
            (0, J.jsxs)(`div`, {
              children: [
                (0, J.jsx)(`strong`, { children: `내 경로는 나에게만` }),
                (0, J.jsx)(`p`, {
                  children: `운행 기록은 본인만 볼 수 있어요. 위치 공유를 켜면 주변 라이더에게 약 200m 격자 위치와 닉네임이 표시돼요. 종료하거나 갱신이 60초 끊기면 숨겨져요.`,
                }),
                (0, J.jsx)(`p`, {
                  children: `웹에서는 화면이 꺼지거나 앱을 전환하면 기록이 끊길 수 있어요. 이동 중에는 휴대폰을 조작하지 마세요.`,
                }),
              ],
            }),
          ],
        }),
      ],
    });
  }
  const rs33NoRiders = [];
  const rs33Zone = "Asia/Seoul";
  const rs33DayFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone: rs33Zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const rs33Clock = new Intl.DateTimeFormat("ko-KR", {
    timeZone: rs33Zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const rs33ISO = (value) => rs33DayFormat.format(new Date(value));
  const rs33Time = (value) => rs33Clock.format(new Date(value));
  const rs33Format = new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 1,
  });
  const rs33J = (tag, props, ...child) => S.createElement(tag, props, ...child);

  /* Rider Spot v43. Display-only algorithms: NEVER alter original GPS points. */

  const rs33AreaKey = "rs-community-area";
  function rs33Area() {
    try {
      const parsed = JSON.parse(localStorage.getItem(rs33AreaKey) || "{}");
      return {
        district: parsed.district || "광주 광산구",
        dong: parsed.dong || "",
        region: parsed.region || "district",
      };
    } catch {
      return { district: "광주 광산구", dong: "", region: "district" };
    }
  }
  function rs33StoreArea(area) {
    try {
      localStorage.setItem(rs33AreaKey, JSON.stringify(area));
    } catch {}
    window.dispatchEvent(
      new CustomEvent("riderspot:activity-area", { detail: area }),
    );
  }
  function RegionSelector({ mode = "map" }) {
    const [area, setArea] = S.useState(rs33Area);
    const [open, setOpen] = S.useState(false);
    S.useEffect(() => {
      const change = (event) => setArea(event.detail || rs33Area());
      window.addEventListener("riderspot:activity-area", change);
      return () =>
        window.removeEventListener("riderspot:activity-area", change);
    }, []);
    function submit(event) {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const district = String(form.get("district") || "").trim(),
        dong = String(form.get("dong") || "").trim();
      if (district.length < 2) return;
      rs33StoreArea({ district, dong, region: dong ? "dong" : "district" });
      setOpen(false);
    }
    return rs33J(
      "div",
      { className: "rs33-region" },
      rs33J(
        "button",
        {
          type: "button",
          className: "rs33-region-toggle",
          "aria-expanded": open,
          onClick: () => setOpen((value) => !value),
        },
        area.dong ? area.district + " · " + area.dong : area.district,
        " ▾",
      ),
      open
        ? rs33J(
            "form",
            { className: "rs33-region-form", onSubmit: submit },
            rs33J(
              "label",
              null,
              "시·군·구",
              rs33J("input", {
                name: "district",
                required: true,
                minLength: 2,
                maxLength: 60,
                list: "rs33-district-list",
                defaultValue: area.district,
              }),
            ),
            rs33J(
              "label",
              null,
              "동 (선택)",
              rs33J("input", {
                name: "dong",
                maxLength: 40,
                list: "rs33-dong-list",
                defaultValue: area.dong,
              }),
            ),
            rs33J(
              "datalist",
              { id: "rs33-district-list" },
              ...rcAreas.map((area) =>
                rs33J("option", { key: area, value: area }),
              ),
            ),
            rs33J(
              "datalist",
              { id: "rs33-dong-list" },
              ...rcDongs.map((area) =>
                rs33J("option", { key: area, value: area }),
              ),
            ),
            rs33J(
              "div",
              null,
              rs33J(
                "button",
                {
                  type: "button",
                  className: "secondary",
                  onClick: () => setOpen(false),
                },
                "취소",
              ),
              rs33J("button", { type: "submit", className: "primary" }, "적용"),
            ),
            mode === "map"
              ? rs33J(
                  "small",
                  null,
                  "활동 지역은 커뮤니티에도 적용돼요. 지도 이동은 내 위치 버튼을 이용해 주세요.",
                )
              : null,
          )
        : null,
    );
  }
  const rs33LayerItems = [
    ["riders", "라이더"],
    ["shelters", "화장실"],
    ["roads", "도로 제보"],
  ];
  function rs33LayerFor(kind) {
    // Facility links use the same toilet-only policy as the rendered map.
    return kind === "roads" ? "roads" : "shelters";
  }
  function MapBar({ layer, choose, sharing, busy, toggle }) {
    return rs33J(
      "div",
      { className: "rs33-map-bar" },
      rs33J(
        "div",
        { className: "rs33-map-bar-top" },
        rs33J("h1", { className: "sr-only" }, "지도"),
        rs33J(RegionSelector),
        rs33J(
          "button",
          {
            type: "button",
            className: "rs33-map-share" + (sharing ? " active" : ""),
            disabled: busy,
            onClick: toggle,
          },
          rs33J("span", { className: "rs-status-dot", "aria-hidden": true }),
          busy ? "확인 중" : sharing ? "공유 중" : "공유 꺼짐",
        ),
      ),
      rs33J(
        "div",
        {
          className: "rs33-map-filters",
          role: "group",
          "aria-label": "지도에 표시할 항목",
        },
        ...rs33LayerItems.map(([id, label]) =>
          rs33J(
            "button",
            {
              type: "button",
              key: id,
              "aria-pressed": layer === id,
              onClick: () => choose(id),
            },
            rs33J(Icon, { name: id, size: 17 }),
            label,
          ),
        ),
      ),
    );
  }
  function rs33OpenMap(record, kind = "places") {
    if (kind !== "roads" && record?.category !== "화장실") return;
    if (!record || !Number.isFinite(record.lat) || !Number.isFinite(record.lng))
      return;
    const layer = rs33LayerFor(kind);
    window.__rs33MapTarget = {
      id: record.id,
      lat: record.lat,
      lng: record.lng,
      layer,
    };
    window.__rsPendingMapCenter = [record.lat, record.lng];
    window.dispatchEvent(
      new CustomEvent("riderspot:map-layer", { detail: layer }),
    );
    window.__rsGoToTab?.("nearby");
    window.dispatchEvent(new Event("riderspot:map-target"));
  }
  function rs33OpenCommunity(request) {
    window.__rs33CommunityRequest = request;
    window.__rsGoToTab?.("community");
    window.dispatchEvent(new Event("riderspot:community-link"));
  }
  function rs33BookmarkQuery(userId, kind, id) {
    const column = kind === "post" ? "post_id" : "place_id";
    return q
      .from("rider_bookmarks")
      .select("id")
      .eq("user_id", userId)
      .eq(column, id)
      .maybeSingle();
  }
  async function rs33ToggleBookmark({ userId, kind, id, saved }) {
    const column = kind === "post" ? "post_id" : "place_id";
    if (saved)
      await Wo(
        q.from("rider_bookmarks").delete().eq("user_id", userId).eq(column, id),
      );
    else {
      const result = await q
        .from("rider_bookmarks")
        .insert({ user_id: userId, [column]: id });
      if (result.error && result.error.code !== "23505") throw result.error;
    }
    window.dispatchEvent(new Event("riderspot:bookmarks"));
    return !saved;
  }
  window.__rs33OpenMap = rs33OpenMap;
  window.__rs33OpenCommunity = rs33OpenCommunity;
  window.__rs33Bookmark = {
    async user() {
      return (await q.auth.getSession()).data.session?.user || null;
    },
    async get(user, kind, id) {
      return Boolean(await Wo(rs33BookmarkQuery(user.id, kind, id)));
    },
    async toggle(user, kind, id, saved) {
      return rs33ToggleBookmark({ userId: user.id, kind, id, saved });
    },
  };
  function BookmarkButton({ user, kind, id, onLogin, notify }) {
    const [saved, setSaved] = S.useState(false);
    const [busy, setBusy] = S.useState(Boolean(user));
    const [failed, setFailed] = S.useState(false);
    const [request, setRequest] = S.useState(0);
    S.useEffect(() => {
      let active = true;
      setFailed(false);
      if (!user) {
        setSaved(false);
        setBusy(false);
        return;
      }
      setBusy(true);
      Wo(rs33BookmarkQuery(user.id, kind, id))
        .then((value) => {
          if (active) setSaved(Boolean(value));
        })
        .catch(() => {
          if (active) setFailed(true);
        })
        .finally(() => {
          if (active) setBusy(false);
        });
      return () => {
        active = false;
      };
    }, [user?.id, kind, id, request]);
    return rs33J(
      "button",
      {
        type: "button",
        className: "rs33-bookmark",
        disabled: busy,
        "aria-pressed": saved,
        onClick: async () => {
          if (!user) return onLogin?.();
          if (failed) {
            setRequest((value) => value + 1);
            return;
          }
          setBusy(true);
          try {
            setSaved(
              await rs33ToggleBookmark({ userId: user.id, kind, id, saved }),
            );
          } catch (error) {
            notify?.(error.message || "저장에 실패했어요.");
          } finally {
            setBusy(false);
          }
        },
      },
      failed ? "저장 상태 다시 확인" : saved ? "✓ 저장됨" : "저장",
    );
  }
  function ProfileTools({ user, onLogin, sharing, toggle, notify }) {
    const [items, setItems] = S.useState([]);
    const [tab, setTab] = S.useState("post");
    const [status, setStatus] = S.useState("");
    const [request, setRequest] = S.useState(0);
    S.useEffect(() => {
      const refresh = () => setRequest((value) => value + 1);
      window.addEventListener("riderspot:bookmarks", refresh);
      return () => window.removeEventListener("riderspot:bookmarks", refresh);
    }, []);
    S.useEffect(() => {
      setItems([]);
      if (!user) {
        setStatus("");
        return;
      }
      let active = true;
      setStatus("저장한 항목을 불러오는 중…");
      Wo(
        q
          .from("rider_bookmarks")
          .select(
            "id,post_id,place_id,posts(id,title,category),rider_places(id,title,category,lat,lng)",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),
      )
        .then((data) => {
          if (active) {
            setItems(data || []);
            setStatus("");
          }
        })
        .catch(() => {
          if (active) setStatus("저장 목록을 불러오지 못했어요.");
        });
      return () => {
        active = false;
      };
    }, [user?.id, request]);
    const visible = items.filter((item) =>
      tab === "post" ? item.post_id : item.place_id,
    );
    return rs33J(
      "div",
      { className: "rs33-profile-tools" },
      rs33J(
        "section",
        null,
        rs33J("h2", null, "내 활동 지역"),
        rs33J(RegionSelector, { mode: "profile" }),
      ),
      rs33J(
        "section",
        null,
        rs33J("h2", null, "위치 공유"),
        rs33J(
          "button",
          { type: "button", className: "rs33-profile-row", onClick: toggle },
          "라이더 위치 공유",
          rs33J("small", null, sharing ? "공유 중 · 종료" : "꺼짐 ›"),
        ),
      ),
      rs33J(
        "section",
        null,
        rs33J("h2", null, "저장한 글과 장소"),
        !user
          ? rs33J(
              "button",
              { type: "button", className: "secondary", onClick: onLogin },
              "로그인하고 저장 목록 보기",
            )
          : rs33J(
              "div",
              null,
              rs33J(
                "div",
                {
                  className: "rs33-bookmark-tabs",
                  role: "group",
                  "aria-label": "저장 목록 종류",
                },
                ...["post", "place"].map((kind) =>
                  rs33J(
                    "button",
                    {
                      type: "button",
                      key: kind,
                      "aria-pressed": tab === kind,
                      onClick: () => setTab(kind),
                    },
                    kind === "post" ? "글" : "장소",
                  ),
                ),
              ),
              status
                ? rs33J(
                    "div",
                    { className: "rs33-muted", role: "status" },
                    status,
                    status.includes("못했")
                      ? rs33J(
                          "button",
                          {
                            type: "button",
                            className: "back",
                            onClick: () => setRequest((value) => value + 1),
                          },
                          "다시 시도",
                        )
                      : null,
                  )
                : visible.length
                  ? visible.map((item) => {
                      const record =
                        tab === "post" ? item.posts : item.rider_places;
                      if (!record) return null;
                      return rs33J(
                        "div",
                        { className: "rs33-bookmark-row", key: item.id },
                        rs33J(
                          "button",
                          {
                            type: "button",
                            className: "rs33-profile-row",
                            onClick: () =>
                              tab === "post"
                                ? rs33OpenCommunity({ postId: record.id })
                                : rs33OpenMap(record),
                          },
                          record.title,
                          rs33J("small", null, record.category),
                        ),
                        rs33J(
                          "button",
                          {
                            type: "button",
                            className: "back",
                            "aria-label": record.title + " 저장 해제",
                            onClick: async () => {
                              try {
                                await rs33ToggleBookmark({
                                  userId: user.id,
                                  kind: tab,
                                  id: record.id,
                                  saved: true,
                                });
                              } catch (error) {
                                notify?.(
                                  error.message || "저장 해제에 실패했어요.",
                                );
                              }
                            },
                          },
                          "해제",
                        ),
                      );
                    })
                  : rs33J(
                      "p",
                      { className: "rs33-muted" },
                      tab === "post"
                        ? "저장한 글이 없어요."
                        : "저장한 장소가 없어요.",
                    ),
            ),
      ),
    );
  }

  var ls = [
    [`nearby`, `지도`, be],
    [`trips`, `타임라인`, Ae],
    [`tools`, `업무`, Pe],
    [`community`, `커뮤니티`, He],
    [`account`, `내 정보`, Be],
  ];
  const Zo = createRiderMap(S, Jo.default, Xo);
  const ss = createTimeline(S, Zo);
  const cs = createUseRide({
    React: S,
    client: q,
    read: Go,
    write: Ko,
    request: Wo,
    displayName: qo,
    appendPoint: $o,
    distanceKm: es,
  });
  function App() {
    let [e, t] = (0, S.useState)(`nearby`),
      [n, r] = (0, S.useState)(null),
      [i, a] = (0, S.useState)(!1),
      [o, s] = (0, S.useState)(``),
      [c, l] = (0, S.useState)(!1),
      [mapLayer, setMapLayer] = (0, S.useState)("shelters"),
      [gpsTick, setGpsTick] = (0, S.useState)(0),
      f = (0, S.useCallback)((e) => s(e), []),
      p = cs(n, f, e);
    window.__rsRideApi = p;
    window.__rsGoToTab = t;
    window.__rsActiveTab = e;
    const rs61Scroll = S.useRef(Object.create(null));
    S.useEffect(() => {
      const target = rs61Scroll.current[e] || 0;
      const frame = requestAnimationFrame(() => window.scrollTo(0, target));
      return () => {
        cancelAnimationFrame(frame);
        rs61Scroll.current[e] = window.scrollY;
      };
    }, [e]);
    (0, S.useEffect)(() => {
      const listener = (event) => {
        if (rs33LayerItems.some(([id]) => id === event.detail))
          setMapLayer(event.detail);
      };
      window.addEventListener("riderspot:map-layer", listener);
      return () => window.removeEventListener("riderspot:map-layer", listener);
    }, []);
    (0, S.useEffect)(() => {
      if (e === "nearby")
        window.dispatchEvent(new Event("riderspot:layer-changed"));
    }, [mapLayer, e]);
    function navigateTab(n) {
      if (n === `tools` && typeof window.__rsOpenTool === `function`) {
        window.__rsOpenTool(`hub`);
        return;
      }
      t(n);
    }
    ((0, S.useEffect)(() => {
      window.dispatchEvent(new Event("riderspot:screen"));
    }, [e]),
      (0, S.useEffect)(() => {
        if (e !== `nearby`) return;
        const timer = setInterval(() => setGpsTick((n) => n + 1), 1e4);
        return () => clearInterval(timer);
      }, [e]),
      (0, S.useEffect)(() => {
        q.auth.getSession().then(({ data: e }) => r(e.session?.user ?? null));
        let { data: e } = q.auth.onAuthStateChange((e, t) =>
          r(t?.user ?? null),
        );
        const refresh = () => r((user) => (user ? { ...user } : user));
        window.addEventListener(`riderspot:nickname`, refresh);
        return () => {
          e.subscription.unsubscribe();
          window.removeEventListener(`riderspot:nickname`, refresh);
        };
      }, []),
      (0, S.useEffect)(() => {
        if (!o) return;
        let e = setTimeout(() => s(``), 6e3);
        return () => clearTimeout(e);
      }, [o]));
    async function m() {
      p.trip
        ? f(`진행 중인 운행을 종료한 뒤 로그아웃해 주세요.`)
        : (await p.stopSharing(), await q.auth.signOut(), f(`로그아웃했어요.`));
    }
    function h() {
      if (p.sharing) return p.stopSharing();
      if (!n) return a(!0);
      setMapLayer("riders");
      l(!0);
    }
    return (0, J.jsxs)(`div`, {
      className: `app`,
      "data-screen": e,
      children: [
        (0, J.jsxs)(`header`, {
          children: [
            (0, J.jsxs)(`a`, {
              href: `#`,
              className: `brand`,
              onClick: (e) => {
                (e.preventDefault(), t(`nearby`));
              },
              children: [
                `라이더스팟`,
                (0, J.jsx)(`span`, { className: `brand-dot` }),
              ],
            }),
            (0, J.jsxs)(`div`, {
              className: `header-right`,
              children: [
                (0, J.jsx)(`span`, {
                  className: `desktop-tag`,
                  children: `도시를 달리는 당신의 동료`,
                }),
                (0, J.jsx)(`button`, {
                  "aria-label": `내 계정`,
                  className: `header-user`,
                  onClick: () => (n ? t(`account`) : a(!0)),
                  children: (0, J.jsx)(Be, { size: 24 }),
                }),
              ],
            }),
          ],
        }),
        (0, J.jsxs)(`div`, {
          className: `workspace`,
          children: [
            (0, J.jsxs)(`aside`, {
              className: `desktop-nav`,
              children: [
                (0, J.jsx)(`p`, { children: `MY RIDER SPOT` }),
                ls.map(([n, r, i]) =>
                  (0, J.jsxs)(
                    `button`,
                    {
                      className: e === n ? `active` : ``,
                      "aria-current": e === n ? "page" : undefined,
                      onClick: () => navigateTab(n),
                      children: [
                        (0, J.jsx)(Icon, {
                          name: {
                            nearby: "map",
                            trips: "route",
                            tools: "work",
                            community: "community",
                            account: "user",
                          }[n],
                          size: 24,
                        }),
                        r,
                      ],
                    },
                    n,
                  ),
                ),
                (0, J.jsxs)(`div`, {
                  className: `sidebar-bottom`,
                  children: [
                    (0, J.jsx)(Pe, { size: 22 }),
                    (0, J.jsx)(`strong`, { children: `내 경로는 나에게만` }),
                    (0, J.jsxs)(`p`, {
                      children: [
                        `함께할 땐 공유하고,`,
                        (0, J.jsx)(`br`, {}),
                        `기록은 안전하게 보관해요.`,
                      ],
                    }),
                    (0, J.jsx)(`small`, { children: `RIDER SPOT` }),
                  ],
                }),
              ],
            }),
            (0, J.jsxs)(`main`, {
              children: [
                p.trip &&
                  e !== `trips` &&
                  e !== `nearby` &&
                  e !== `tools` &&
                  (0, J.jsxs)(`button`, {
                    className: `recording-strip`,
                    onClick: () => t(`trips`),
                    children: [
                      (0, J.jsx)(`span`, {}),
                      ` `,
                      p.paused ? `일시정지` : `운행 중`,
                      ` · `,
                      p.trip.distance_km.toFixed(1),
                      ` km `,
                      (0, J.jsx)(`strong`, { children: `운행 보기` }),
                    ],
                  }),
                e === `nearby`
                  ? (0, J.jsxs)(`section`, {
                      key: `route-map`,
                      className: `nearby nearby-full`,
                      children: [
                        (0, J.jsx)(MapBar, {
                          layer: mapLayer,
                          choose: setMapLayer,
                          sharing: p.sharing,
                          busy: p.busy,
                          toggle: h,
                        }),
                        (0, J.jsxs)(`div`, {
                          className: `map-wrap rs33-map-wrap`,
                          "data-rs33-layer": mapLayer,
                          children: [
                            (0, J.jsx)(Zo, {
                              position: p.position,
                              riders:
                                p.sharing && mapLayer === "riders"
                                  ? p.riders
                                  : rs33NoRiders,
                              focus: p.focus,
                            }),
                            (0, J.jsxs)(`button`, {
                              type: `button`,
                              className:
                                p.gpsStatus === `ready`
                                  ? p.position?.t &&
                                    Date.now() - p.position.t > 6e4
                                    ? `rs-gps-state rs-gps-stale`
                                    : `rs-gps-state rs-gps-ok`
                                  : p.gpsStatus === `error`
                                    ? `rs-gps-state rs-gps-error`
                                    : `rs-gps-state`,
                              onClick: () =>
                                p.locate().catch((err) => f(err.message)),
                              title: p.gpsProblem || `내 GPS 위치 상태`,
                              children: [
                                (0, J.jsx)(`span`, {
                                  className: `rs-gps-indicator`,
                                }),
                                (0, J.jsx)(`span`, {
                                  children:
                                    p.gpsStatus === `ready`
                                      ? p.position?.t
                                        ? Date.now() - p.position.t > 6e4
                                          ? `GPS 갱신 지연 · 눌러서 확인`
                                          : `GPS ${Math.max(0, Math.floor((Date.now() - p.position.t) / 1e3))}초 전 · ${p.sharing ? `공유 중` : `비공개`}`
                                        : p.sharing
                                          ? `내 위치 확인됨 · 공유 중`
                                          : `내 위치 확인됨 · 비공개`
                                      : p.gpsStatus === `error`
                                        ? p.gpsProblem ||
                                          `GPS 오류 · 눌러서 다시 시도`
                                        : `내 위치 확인 중…`,
                                }),
                              ],
                            }),
                            (0, J.jsx)(`button`, {
                              className: `locate`,
                              "aria-label": `내 위치로 이동`,
                              onClick: () =>
                                p.locate().catch((e) => f(e.message)),
                              children: (0, J.jsx)(ge, { size: 23 }),
                            }),
                          ],
                        }),
                        (0, J.jsxs)("div", {
                          className: "rs61-home-dock",
                          "aria-label": "운행 기록 제어",
                          children: [
                            (0, J.jsxs)("div", {
                              children: [
                                (0, J.jsx)("strong", {
                                  children: p.trip ? (p.paused ? "휴식 중" : "운행 기록 중") : "오늘의 운행을 기록하세요",
                                }),
                                (0, J.jsx)("small", {
                                  children: p.trip
                                    ? (Math.max(0, Math.floor((Date.now() - Date.parse(p.trip.started_at || Date.now())) / 60000)) + "분 · " +
                                       (Number(p.trip.distance_km) || 0).toFixed(1) + "km · " +
                                       (p.gpsStatus === "ready" ? "GPS 정상" : "GPS 확인 필요"))
                                    : "공유 설정과 별개로 내 기록만 저장돼요",
                                }),
                              ],
                            }),
                            p.trip
                              ? (0, J.jsxs)("div", {
                                  className: "rs61-ride-actions",
                                  children: [
                                    (0, J.jsx)("button", {
                                      type: "button",
                                      disabled: p.busy,
                                      onClick: () => Promise.resolve(p.togglePause()).catch(err => f(err?.message || "휴식 상태를 변경하지 못했어요.")),
                                      children: p.paused ? "재개" : "휴식",
                                    }),
                                    (0, J.jsx)("button", {
                                      type: "button",
                                      onClick: () => t("trips"),
                                      children: "기록 보기",
                                    }),
                                  ],
                                })
                              : (0, J.jsx)("button", {
                                  type: "button",
                                  disabled: p.busy,
                                  onClick: () => Promise.resolve(p.startTrip()).catch(err => f(err?.message || "운행을 시작하지 못했어요.")),
                                  children: p.busy ? "확인 중…" : "운행 시작",
                                }),
                          ],
                        }),
                      ],
                    })
                  : e === `tools`
                    ? (0, J.jsx)(`section`, {
                        key: `route-tools`,
                        className: `rs-tools-route`,
                        children: (0, J.jsx)(`div`, { id: `rs-tools-host` }),
                      })
                    : e === `community`
                      ? (0, J.jsx)(Community, {
                          user: n,
                          onLogin: () => a(!0),
                          notify: f,
                        })
                      : e === `trips`
                        ? (0, J.jsx)(ss, { ride: p, notify: f })
                        : (0, J.jsx)(
                            Profile,
                            {
                              user: n,
                              onLogin: () => a(!0),
                              onLogout: m,
                              notify: f,
                              sharing: p.sharing,
                              toggle: h,
                              history: p.history,
                              riding: Boolean(p.trip && !p.paused),
                              onTimeline: () => t("trips"),
                            },
                            n?.id || `guest`,
                          ),
              ],
            }),
          ],
        }),
        (0, J.jsx)(`nav`, {
          className: `bottom-nav`,
          "aria-label": `주 메뉴`,
          children: ls.map(([n, r, i]) =>
            (0, J.jsxs)(
              `button`,
              {
                className: e === n ? `active` : ``,
                "aria-current": e === n ? "page" : undefined,
                onClick: () => navigateTab(n),
                children: [
                  (0, J.jsx)(Icon, {
                    name: {
                      nearby: "map",
                      trips: "route",
                      tools: "work",
                      community: "community",
                      account: "user",
                    }[n],
                    size: 24,
                  }),
                  (0, J.jsx)(`span`, { children: r }),
                ],
              },
              n,
            ),
          ),
        }),
        i && (0, J.jsx)(AuthDialog, { close: () => a(!1), notify: f }),
        ` `,
        c &&
          (0, J.jsx)(DialogSurface, {
            onClose: () => l(false),
            children: (0, J.jsxs)(`section`, {
              className: `modal`,
              role: `dialog`,
              "aria-modal": `true`,
              "aria-labelledby": `share-title`,
              children: [
                (0, J.jsx)(`button`, {
                  className: `close`,
                  "aria-label": `닫기`,
                  onClick: () => l(!1),
                  children: (0, J.jsx)(We, {}),
                }),
                (0, J.jsx)(`div`, {
                  className: `avatar`,
                  children: (0, J.jsx)(be, {}),
                }),
                (0, J.jsx)(`h2`, {
                  id: `share-title`,
                  children: `주변 라이더와 위치를 나눌까요?`,
                }),
                (0, J.jsx)(`p`, {
                  children: `공유 중인 낯선 라이더도 내 닉네임과 대략적인 현재 위치를 볼 수 있어요.`,
                }),
                (0, J.jsxs)(`ul`, {
                  className: `consent-list`,
                  children: [
                    (0, J.jsx)(`li`, {
                      children: `공유 위치는 약 200m 격자로 표시`,
                    }),
                    (0, J.jsx)(`li`, {
                      children: `내 운행 경로와 과거 위치는 비공개`,
                    }),
                    (0, J.jsx)(`li`, {
                      children: `앱을 백그라운드로 보내면 위치 공유 자동 종료`,
                    }),
                    (0, J.jsx)(`li`, {
                      children: `통신이 끊기면 최대 60초 후 숨김`,
                    }),
                  ],
                }),
                (0, J.jsx)(`button`, {
                  className: `primary full`,
                  onClick: () => {
                    (l(!1), p.startSharing());
                  },
                  children: `동의하고 위치 공유`,
                }),
                (0, J.jsx)(`button`, {
                  className: `text-button`,
                  onClick: () => l(!1),
                  children: `나중에 할게요`,
                }),
              ],
            }),
          }),
        o &&
          (0, J.jsx)(`div`, {
            role: `status`,
            className: `toast`,
            onClick: () => s(``),
            children: o,
          }),
      ],
    });
  }
  (0, Ge.createRoot)(document.getElementById(`root`)).render(
    (0, J.jsx)(App, {}),
  );
}
