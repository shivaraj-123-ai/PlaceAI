/**
 * PlaceAI custom fetch wrapper
 * Implements 120-second timeouts, automatic retries, dynamic loading messages, and friendly error mappings.
 */

const fetchWithTimeout = async (url, options, timeout = 120000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timer);
    return response;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
};

const fetchWithRetry = async (url, options, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetchWithTimeout(url, options);
      if (response.ok) return response;

      // Throw on server-side errors (>= 500) to trigger retry
      if (response.status >= 500) {
        throw new Error(`500 error`);
      }
      // Return 4xx client errors immediately
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;

      // Map raw error to friendly message during retry
      let friendlyMessage = 'Connection issue. Retrying automatically...';
      const errMsg = error.message || '';
      const errName = error.name || '';

      if (errName === 'AbortError' || errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('aborted')) {
        friendlyMessage = 'This is taking longer than usual. Please wait...';
      } else if (errMsg.includes('500') || errMsg.toLowerCase().includes('server error')) {
        friendlyMessage = 'Something went wrong. Please try again.';
      } else if (errMsg.toLowerCase().includes('failed to fetch')) {
        friendlyMessage = 'Connection issue. Retrying automatically...';
      }

      window.dispatchEvent(
        new CustomEvent('api-progress', {
          detail: {
            message: `${friendlyMessage}\nRetrying... (Attempt ${i + 2}/${retries})`
          }
        })
      );

      await new Promise(r => setTimeout(r, 2000));
      console.log(`Retrying... attempt ${i + 2}`);
    }
  }
};

export async function apiFetch(url, options = {}) {
  // Determine default loading message based on URL
  let loadingMessage = options.loadingMessage;
  if (!loadingMessage) {
    if (url.includes('/resume')) {
      loadingMessage = 'Analysing your resume... please wait';
    } else if (url.includes('/questions')) {
      loadingMessage = 'Generating questions... this may take up to 30 seconds';
    } else if (url.includes('/feedback') || url.includes('/retry')) {
      loadingMessage = 'ARIA is preparing your feedback...';
    } else {
      loadingMessage = 'Connecting to placement server...';
    }
  }

  // Dispatch initial load event
  window.dispatchEvent(
    new CustomEvent('api-start', {
      detail: { message: loadingMessage }
    })
  );

  try {
    const response = await fetchWithRetry(url, options);
    window.dispatchEvent(new CustomEvent('api-end'));
    return response;
  } catch (error) {
    window.dispatchEvent(new CustomEvent('api-end'));

    // Map final error to friendly error message for the UI
    let finalFriendlyMessage = 'Something went wrong. Please try again.';
    const errMsg = error.message || '';
    const errName = error.name || '';

    if (errName === 'AbortError' || errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('aborted')) {
      finalFriendlyMessage = 'This is taking longer than usual. Please wait...';
    } else if (errMsg.includes('500') || errMsg.toLowerCase().includes('server error')) {
      finalFriendlyMessage = 'Something went wrong. Please try again.';
    } else if (errMsg.toLowerCase().includes('failed to fetch')) {
      finalFriendlyMessage = 'Connection issue. Retrying automatically...';
    }

    throw new Error(finalFriendlyMessage);
  }
}
