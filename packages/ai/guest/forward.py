# Forwards TCP connections on localhost to the host's proxy over vsock, since the guest has no other network.
import asyncio
import os
import socket

HOST_CID = 2
PORT = int(os.environ['SANDBOX_PROXY_PORT'])


async def pipe(reader, writer):
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    except OSError:
        pass
    finally:
        writer.close()


async def handle(reader, writer):
    vsock = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM)
    vsock.setblocking(False)
    try:
        await asyncio.get_running_loop().sock_connect(vsock, (HOST_CID, PORT))
    except OSError:
        vsock.close()
        writer.close()
        return
    upstream_reader, upstream_writer = await asyncio.open_connection(sock=vsock)
    await asyncio.gather(pipe(reader, upstream_writer), pipe(upstream_reader, writer))


async def main():
    server = await asyncio.start_server(handle, '127.0.0.1', PORT)
    open('/tmp/.proxy-ready', 'w').close()
    await server.serve_forever()


asyncio.run(main())
