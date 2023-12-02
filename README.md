# github-webhooks

I looked around for github hooks running server scripts on github webhook events and didn't find something I liked. I made my own as an elysia Bun server. I plan to run this on a reverse nginx proxy.

Setup a config like so:

```json
{
  "hostname": "127.0.0.1",
  "port": 4444,
  "secret": null,
  "refs": {
    "niemal/unitedgpt": {
      "refs/heads/main": {
        "push": ["/test.sh"]
      }
    }
  }
}
```

Where the `refs` record contains the `full_name` of your repository as a key, pointing to a record of `branch head` (`main` i.e.) which points to events (`push` i.e.) corresponding to an array in which the first argument is the location of the script you want to run, accompanied by arguments as the rest items of the array.

To run (TODO setup service):

```bash
bun run index.ts
```
