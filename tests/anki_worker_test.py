"""Exercise real Anki card creation against isolated collections, with no network/TTS."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("worker", Path(__file__).resolve().parents[1] / "scripts/register_anki_card.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class RegistrationTest(unittest.TestCase):
    def test_basic_audio_card_retry_and_separate_decks(self):
        from anki.collection import Collection
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            mp3 = root / "test.mp3"
            mp3.write_bytes(b"test audio")
            data = {"text": 'An <interesting> sentence.', "deck": "영어::독서::테스트"}
            with patch.dict(worker.os.environ, {"ANKI_SYNC_ENDPOINT": "http://localhost:8080/", "ANKI_SYNC_USER": "test", "ANKI_SYNC_PASSWORD": "secret"}), \
                 patch.object(Collection, "sync_login", return_value=SimpleNamespace()), \
                 patch.object(worker, "sync"), patch.object(worker, "audio", return_value=mp3), \
                 patch.object(worker, "run_translation", return_value='{"translation":"흥미로운 문장입니다."}') as translator, \
                 patch.object(Collection, "sync_media"), \
                 patch.object(Collection, "media_sync_status", return_value=SimpleNamespace(active=False)):
                first = worker.register(data, root)
                retry = worker.register(data, root)
                self.assertFalse(first["duplicate"])
                self.assertTrue(retry["duplicate"])
                self.assertEqual(first["noteId"], retry["noteId"])
                self.assertEqual(translator.call_count, 1)
                other = worker.register({**data, "deck": "다른 덱"}, root)
                self.assertNotEqual(first["noteId"], other["noteId"])
                col = Collection(str(root / "collection.anki2"))
                try:
                    self.assertEqual(col.note_count(), 2)
                    note = col.get_note(first["noteId"])
                    self.assertEqual(note.note_type()["name"], "Basic")
                    self.assertEqual(note["Front"], "[sound:test.mp3]")
                    self.assertEqual(note["Back"], "An &lt;interesting&gt; sentence.<br><br>흥미로운 문장입니다.")
                    note["Back"] = "Manual edit"
                    col.update_note(note)
                finally:
                    col.close()
                with self.assertRaises(worker.CardError):
                    worker.register(data, root)

    def test_hermes_uses_medium_and_stdin_for_local_and_ssh_calls(self):
        from types import SimpleNamespace
        prompt = 'Selected text: $(touch /tmp/never-run) "quoted"'
        result = SimpleNamespace(returncode=0, stdout='Warning: Unknown toolsets: none\n{"translation":"번역"}')
        with patch.dict(worker.os.environ, {"HERMES_SSH_TARGET": "", "HERMES_BIN": "/bin/hermes"}), \
             patch.object(worker.subprocess, "run", return_value=result) as run:
            self.assertEqual(worker.run_translation(prompt), '{"translation":"번역"}')
            command = run.call_args.args[0]
            self.assertIn("gpt-6-luna", command)
            self.assertIn("medium", command)
            self.assertIn("--query-file", command)
            self.assertEqual(run.call_args.kwargs["input"], prompt)
            self.assertNotIn("shell", run.call_args.kwargs)
        with patch.dict(worker.os.environ, {"HERMES_SSH_TARGET": "hermes@host", "HERMES_SSH_IDENTITY_FILE": "/key", "HERMES_SSH_KNOWN_HOSTS_FILE": "/hosts"}), \
             patch.object(worker.subprocess, "run", return_value=result) as run:
            self.assertEqual(worker.run_translation(prompt), '{"translation":"번역"}')
            command = run.call_args.args[0]
            self.assertEqual(command[0], "ssh")
            self.assertIn("StrictHostKeyChecking=yes", command)
            self.assertNotIn(prompt, command[-1])
            self.assertEqual(run.call_args.kwargs["input"], prompt)

    def test_translation_validation_context_and_escaping(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = {"text": "A <sentence>.", "context": "Before and after."}
            root = Path(tmp)
            with patch.object(worker, "run_translation", return_value='{"translation":"문장 <하나>."}') as translator:
                back = worker.card_back(root, data, "example")
                self.assertEqual(back, "A &lt;sentence&gt;.<br><br>문장 &lt;하나&gt;.")
                self.assertIn("Before and after.", translator.call_args.args[0])
                self.assertEqual(worker.card_back(root, data, "example"), back)
                self.assertEqual(translator.call_count, 1)
            for response in ['not JSON', '{"translation":""}', '{"translation":"English only"}', '{}']:
                with patch.object(worker, "run_translation", return_value=response):
                    with self.assertRaises(worker.CardError):
                        worker.card_back(root, data, "invalid")
                self.assertFalse((root / "cards/invalid.json").exists())

    def test_failure_after_creation_resumes_without_duplicate(self):
        from anki.collection import Collection
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            mp3 = root / "test.mp3"
            mp3.write_bytes(b"test audio")
            data = {"text": "A sentence.", "deck": "English"}
            with patch.dict(worker.os.environ, {"ANKI_SYNC_ENDPOINT": "http://localhost:8080/", "ANKI_SYNC_USER": "test", "ANKI_SYNC_PASSWORD": "secret"}), \
                 patch.object(Collection, "sync_login", return_value=SimpleNamespace()), \
                 patch.object(worker, "sync"), patch.object(worker, "audio", return_value=mp3), \
                 patch.object(worker, "run_translation", return_value='{"translation":"흥미로운 문장입니다."}') as translator, \
                 patch.object(Collection, "media_sync_status", return_value=SimpleNamespace(active=False)):
                with patch.object(Collection, "sync_media", side_effect=RuntimeError("network")):
                    with self.assertRaises(RuntimeError):
                        worker.register(data, root)
                with patch.object(Collection, "sync_media"):
                    result = worker.register(data, root)
                    self.assertTrue(result["duplicate"])
                    self.assertEqual(translator.call_count, 1)
                col = Collection(str(root / "collection.anki2"))
                try:
                    self.assertEqual(col.note_count(), 1)
                finally:
                    col.close()


if __name__ == "__main__":
    unittest.main()
