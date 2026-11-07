// Executa o código do candidato com Pyodide, fora da thread principal.
// A thread principal mata este worker se passar do timeout (loop infinito).
importScripts("/pyodide/pyodide.js");

// Carrega o Pyodide já na criação do worker e avisa a thread principal.
let pyPromise = loadPyodide({ indexURL: "/pyodide/" });
pyPromise.then(
  () => self.postMessage({ ready: true }),
  (err) => self.postMessage({ ready: false, error: String(err) }),
);

const HARNESS = `
import json, time, traceback
def _run():
    ns = {"__name__": "__candidate__"}
    try:
        exec(compile(USER_CODE, "<solucao>", "exec"), ns)
        fn = ns[FNAME]
    except KeyError:
        return json.dumps({"fatal": "Função '%s' não encontrada. Mantenha a assinatura inicial." % FNAME})
    except BaseException:
        return json.dumps({"fatal": traceback.format_exc(limit=3)})
    results = []
    for t in json.loads(TESTS_JSON):
        s = time.perf_counter()
        try:
            got = fn(*t["args"])
            ms = (time.perf_counter() - s) * 1000
            if COMPARE == "sorted":
                ok = sorted(got) == sorted(t["expected"])
            else:
                ok = got == t["expected"]
            results.append({"name": t["name"], "passed": bool(ok), "got": repr(got), "ms": ms})
        except BaseException:
            ms = (time.perf_counter() - s) * 1000
            results.append({"name": t["name"], "passed": False, "error": traceback.format_exc(limit=2), "ms": ms})
    return json.dumps({"results": results})
_run()
`;

self.onmessage = async (e) => {
  const { id, code, fname, tests, compare } = e.data;
  try {
    const py = await pyPromise;
    const out = [];
    py.setStdout({ batched: (s) => out.push(s) });
    py.setStderr({ batched: (s) => out.push(s) });
    py.globals.set("USER_CODE", code);
    py.globals.set("FNAME", fname);
    py.globals.set("TESTS_JSON", JSON.stringify(tests));
    py.globals.set("COMPARE", compare);
    const raw = await py.runPythonAsync(HARNESS);
    self.postMessage({ id, ok: true, data: JSON.parse(raw), stdout: out.join("\n") });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
