(() => {
  const data = window.COMPARISON_DATA;
  const root = document.querySelector("#comparison-root");
  const directionNav = document.querySelector("#direction-nav");
  const resultCount = document.querySelector("#result-count");
  const distanceButtons = [...document.querySelectorAll("[data-distance]")];
  const otherDatasetLink = document.querySelector("#other-dataset-link");

  if (!data || !root || !directionNav) return;

  const directionMeta = {
    L: { name: "Left", description: "Left camera path" },
    R: { name: "Right", description: "Right camera path" },
    U: { name: "Up", description: "Upward camera path" },
  };

  let activeDistance = data.defaultDistance || "1m";
  let pairControllers = [];

  const pauseOtherPairs = (activePair) => {
    document.querySelectorAll("[data-pair]").forEach((pair) => {
      if (pair === activePair) return;
      pair.querySelectorAll("video").forEach((video) => video.pause());
      const button = pair.querySelector(".sync-button");
      if (button) {
        button.textContent = "Play both";
        button.classList.remove("is-playing");
        button.setAttribute("aria-pressed", "false");
      }
    });
  };

  const bindPair = (pair) => {
    const videos = [...pair.querySelectorAll("video")];
    const button = pair.querySelector(".sync-button");
    let syncing = false;

    const updateButton = () => {
      const isPlaying = videos.some((video) => !video.paused && !video.ended);
      button.textContent = isPlaying ? "Pause both" : "Play both";
      button.classList.toggle("is-playing", isPlaying);
      button.setAttribute("aria-pressed", String(isPlaying));
    };

    const alignFrom = (source, threshold = 0.08) => {
      if (syncing) return;
      syncing = true;
      videos.forEach((video) => {
        if (video === source || !Number.isFinite(source.currentTime)) return;
        if (Math.abs(video.currentTime - source.currentTime) > threshold) {
          const duration = Number.isFinite(video.duration) ? video.duration : source.currentTime;
          video.currentTime = Math.min(source.currentTime, duration);
        }
      });
      syncing = false;
    };

    button.addEventListener("click", async () => {
      const shouldPlay = videos.every((video) => video.paused || video.ended);
      if (!shouldPlay) {
        videos.forEach((video) => video.pause());
        updateButton();
        return;
      }

      pauseOtherPairs(pair);
      if (videos.every((video) => video.ended)) {
        videos.forEach((video) => { video.currentTime = 0; });
      }
      const anchorTime = Math.min(...videos.map((video) => video.currentTime));
      videos.forEach((video) => { video.currentTime = anchorTime; });
      await Promise.allSettled(videos.map((video) => video.play()));
      updateButton();
    });

    videos.forEach((video) => {
      video.addEventListener("play", async () => {
        if (syncing) return;
        syncing = true;
        pauseOtherPairs(pair);
        videos.forEach((other) => {
          if (other !== video && Math.abs(other.currentTime - video.currentTime) > 0.08) {
            other.currentTime = video.currentTime;
          }
        });
        await Promise.allSettled(
          videos.filter((other) => other !== video && other.paused).map((other) => other.play())
        );
        syncing = false;
        updateButton();
      });

      video.addEventListener("pause", () => {
        if (syncing || video.ended) {
          updateButton();
          return;
        }
        syncing = true;
        videos.filter((other) => other !== video).forEach((other) => other.pause());
        syncing = false;
        updateButton();
      });

      video.addEventListener("seeking", () => alignFrom(video, 0.01));
      video.addEventListener("ratechange", () => {
        videos.filter((other) => other !== video).forEach((other) => {
          other.playbackRate = video.playbackRate;
        });
      });
      video.addEventListener("ended", updateButton);
      video.addEventListener("error", () => {
        video.closest(".video-card")?.classList.add("has-error");
      });
    });

    videos[0].addEventListener("timeupdate", () => {
      if (!videos[0].paused && !videos[1].paused) alignFrom(videos[0]);
    });

    pairControllers.push({ pause: () => videos.forEach((video) => video.pause()) });
  };

  const comparisonMarkup = (item, index) => `
    <article class="comparison" data-pair>
      <div class="comparison-meta">
        <div class="sequence-info">
          <span class="sequence-label">Sequence ${String(index + 1).padStart(2, "0")}</span>
          <span class="scene-id">${item.scene}</span>
        </div>
        <button class="sync-button" type="button" aria-pressed="false">Play both</button>
      </div>
      <div class="video-grid">
        <div class="video-card input">
          <div class="video-label">Input</div>
          <video controls muted playsinline preload="metadata">
            <source src="${item.input}" type="video/mp4" />
          </video>
          <div class="video-error" role="status">Input video could not be loaded.</div>
        </div>
        <div class="video-card output">
          <div class="video-label">Output</div>
          <video controls muted playsinline preload="metadata">
            <source src="${item.output}" type="video/mp4" />
          </video>
          <div class="video-error" role="status">Output video could not be loaded.</div>
        </div>
      </div>
    </article>`;

  const sectionMarkup = (direction, items) => {
    const meta = directionMeta[direction];
    return `
      <section class="view-section" id="${direction.toLowerCase()}-view" aria-labelledby="${direction.toLowerCase()}-title">
        <div class="section-heading">
          <div class="section-title-group">
            <h2 id="${direction.toLowerCase()}-title">${direction}</h2>
            <p>${meta.description}</p>
          </div>
          <span class="section-count">${items.length} ${items.length === 1 ? "sequence" : "sequences"}</span>
        </div>
        <div class="comparison-list">
          ${items.map(comparisonMarkup).join("")}
        </div>
      </section>`;
  };

  const render = (distance, updateUrl = true) => {
    if (!data.distances[distance]) distance = data.defaultDistance;
    pairControllers.forEach((controller) => controller.pause());
    pairControllers = [];
    activeDistance = distance;

    const directions = data.distances[distance].directions;
    const entries = Object.entries(directions).filter(([, items]) => items.length);
    const total = entries.reduce((sum, [, items]) => sum + items.length, 0);

    distanceButtons.forEach((button) => {
      const selected = button.dataset.distance === distance;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });

    directionNav.innerHTML = entries.map(([direction, items]) => `
      <a href="#${direction.toLowerCase()}-view">
        <strong>${direction}</strong>
        <span>${directionMeta[direction].name} · ${items.length}</span>
      </a>`).join("");

    resultCount.innerHTML = `<strong>${total} paired comparisons</strong>${distance.toUpperCase()} camera displacement`;
    root.innerHTML = entries.map(([direction, items]) => sectionMarkup(direction, items)).join("");
    root.querySelectorAll("[data-pair]").forEach(bindPair);

    if (otherDatasetLink) {
      const target = new URL(otherDatasetLink.getAttribute("href"), window.location.href);
      target.searchParams.set("distance", distance);
      otherDatasetLink.href = target.href;
    }

    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("distance", distance);
      history.replaceState({ distance }, "", url);
    }
  };

  distanceButtons.forEach((button) => {
    button.addEventListener("click", () => render(button.dataset.distance));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = distanceButtons.indexOf(button);
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = distanceButtons[(currentIndex + step + distanceButtons.length) % distanceButtons.length];
      next.focus();
      render(next.dataset.distance);
    });
  });

  const requestedDistance = new URLSearchParams(window.location.search).get("distance");
  render(data.distances[requestedDistance] ? requestedDistance : activeDistance, false);
})();
