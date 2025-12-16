import { ArrowLeft } from "lucide-react";
import { useRouter } from "@tanstack/react-router";



interface BackButtonProps extends React.HTMLAttributes<HTMLButtonElement> { }

const BackButton = (props: BackButtonProps) => {
    const router = useRouter();

    return <button className={`h-10 w-10 self-start items-center justify-center flex hover:bg-black/10 rounded-md ${props.className}`} onClick={() => router.history.back()} {...props}>
        <ArrowLeft size={20} />
    </button>;
}

export default BackButton;